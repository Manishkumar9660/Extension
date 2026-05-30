import { useState, useEffect } from 'react';
import { useLiveQuery } from 'dexie-react-hooks';
import { 
  db, 
  searchConversations, 
  getConversationMessages, 
  moveConversationToProject,
  deleteConversation
} from '../../services/db';
import { estimateTokenCount } from '../../services/token';
import { 
  Search, 
  Folder, 
  Cpu, 
  FileText, 
  Copy, 
  Download, 
  ExternalLink, 
  Check, 
  X, 
  Trash2,
  CalendarDays,
  MessageSquare,
  Clock,
  ArrowLeft,
  ChevronRight
} from 'lucide-react';

interface SavedContextsViewProps {
  isPopup: boolean;
}

export default function SavedContextsView({ isPopup }: SavedContextsViewProps) {
  // Search state
  const [query, setQuery] = useState('');
  const [platform, setPlatform] = useState('all');
  const [projectId, setProjectId] = useState<string>('all');
  const [startDate, setStartDate] = useState('');
  const [endDate, setEndDate] = useState('');

  // UI Selection states
  const [selectedConvoId, setSelectedConvoId] = useState<string | null>(null);
  const [copiedId, setCopiedId] = useState<string | null>(null);
  const [exportFormat, setExportFormat] = useState<'md' | 'json' | 'txt'>('md');
  const [showExportModal, setShowExportModal] = useState(false);

  // Mobile navigation inside popup
  const [popupShowDetail, setPopupShowDetail] = useState(false);

  // --- Dynamic Search Queries ---
  // Re-runs whenever filters change
  const [searchResults, setSearchResults] = useState<any[]>([]);

  // Fetch all projects for filter dropdown
  const allProjects = useLiveQuery(() => db.projects.toArray()) ?? [];

  useEffect(() => {
    const executeSearch = async () => {
      try {
        const filters: any = { query };
        
        if (platform !== 'all') filters.platform = platform;
        if (projectId !== 'all') {
          filters.projectId = projectId === 'unassigned' ? null : projectId;
        }

        if (startDate || endDate) {
          const start = startDate ? new Date(startDate).getTime() : 0;
          const end = endDate ? new Date(endDate).getTime() + 86400000 : Date.now() * 2; // cover end of day
          filters.dateRange = { start, end };
        }

        const results = await searchConversations(filters);
        setSearchResults(results);
        
        // Auto-select first search result on workspace if nothing is selected or previous is gone
        if (!isPopup && results.length > 0 && (!selectedConvoId || !results.some(r => r.conversation.id === selectedConvoId))) {
          setSelectedConvoId(results[0].conversation.id);
        }
      } catch (err) {
        console.error('Search failed:', err);
      }
    };

    const delayDebounce = setTimeout(() => {
      executeSearch();
    }, 200); // lightweight debounce to prevent IndexedDB thrashing on rapid keystrokes

    return () => clearTimeout(delayDebounce);
  }, [query, platform, projectId, startDate, endDate, selectedConvoId, isPopup]);

  // Fetch details of selected conversation
  const selectedConversation = useLiveQuery(async () => {
    if (!selectedConvoId) return null;
    const convo = await db.conversations.get(selectedConvoId);
    if (!convo) return null;
    
    // Decrypt details
    let title = convo.title;
    if (title.startsWith('enc:')) {
      try {
        const { getActiveCryptoKey, decryptTitle } = await import('../../services/db');
        const key = await getActiveCryptoKey();
        title = await decryptTitle(convo.title, key);
      } catch {
        title = '[Encrypted Chat]';
      }
    }
    return { ...convo, title };
  }, [selectedConvoId]);

  const selectedMessages = useLiveQuery(() => 
    selectedConvoId ? getConversationMessages(selectedConvoId) : Promise.resolve([])
  , [selectedConvoId]) ?? [];

  // Estimated tokens for active chat
  const activeChatTokens = selectedMessages.reduce((sum, m) => sum + estimateTokenCount(m.content), 0);

  // --- Actions ---

  const handleCopyClipboard = (text: string, id: string) => {
    navigator.clipboard.writeText(text);
    setCopiedId(id);
    setTimeout(() => setCopiedId(null), 2000);
  };

  const handleProjectReassign = async (newProjId: string) => {
    if (!selectedConvoId) return;
    const mappedVal = newProjId === 'unassigned' ? null : newProjId;
    await moveConversationToProject(selectedConvoId, mappedVal);
  };

  const handleConfirmDelete = async () => {
    if (!selectedConvoId) return;
    if (confirm('Delete this conversation permanently? This action is local and irreversible.')) {
      await deleteConversation(selectedConvoId);
      setSelectedConvoId(null);
      setPopupShowDetail(false);
    }
  };

  const handleMigrateToClaude = () => {
    if (selectedMessages.length === 0 || !selectedConversation) return;

    let formattedText = `=== AI CONTEXT BRIDGE: CONTINUING PROJECT ===\n`;
    formattedText += `Migrated conversation thread from ${selectedConversation.platform.toUpperCase()}\n`;
    formattedText += `Original URL: ${selectedConversation.url}\n\n`;

    selectedMessages.forEach((msg) => {
      const roleName = msg.role === 'user' ? 'USER' : 'AI ASSISTANT';
      formattedText += `[${roleName}]:\n${msg.content}\n\n`;
    });

    formattedText += `=== END OF CAPTURED CONTEXT ===\n`;
    formattedText += `Please acknowledge this history context and prepare for my next prompt.`;

    if (typeof chrome !== 'undefined' && chrome.runtime && chrome.runtime.sendMessage) {
      chrome.runtime.sendMessage({
        type: 'CONTINUE_IN_CLAUDE',
        data: { formattedContext: formattedText }
      });
    }
  };

  // Compile formatted exports
  const getCompiledExportText = (): string => {
    if (!selectedConversation) return '';

    if (exportFormat === 'json') {
      const jsonDump = {
        title: selectedConversation.title,
        platform: selectedConversation.platform,
        url: selectedConversation.url,
        capturedAt: new Date(selectedConversation.capturedAt).toISOString(),
        messageCount: selectedMessages.length,
        messages: selectedMessages.map(m => ({ role: m.role, content: m.content, index: m.index }))
      };
      return JSON.stringify(jsonDump, null, 2);
    }

    if (exportFormat === 'txt') {
      let txt = `TITLE: ${selectedConversation.title}\n`;
      txt += `PLATFORM: ${selectedConversation.platform.toUpperCase()}\n`;
      txt += `DATE: ${new Date(selectedConversation.updatedAt).toLocaleString()}\n`;
      txt += `URL: ${selectedConversation.url}\n\n`;
      txt += `=========================================\n\n`;
      
      selectedMessages.forEach((m) => {
        txt += `[${m.role.toUpperCase()}]:\n${m.content}\n\n`;
      });
      return txt;
    }

    // Default: Markdown (MD)
    let md = `# ${selectedConversation.title}\n\n`;
    md += `* **Source Platform:** ${selectedConversation.platform.toUpperCase()}\n`;
    md += `* **Archived Date:** ${new Date(selectedConversation.updatedAt).toLocaleString()}\n`;
    md += `* **URL Link:** [Original Web Chat](${selectedConversation.url})\n\n`;
    md += `---\n\n`;

    selectedMessages.forEach((m) => {
      const speaker = m.role === 'user' ? '👤 **User**' : '🤖 **AI Assistant**';
      md += `${speaker}:\n\n${m.content}\n\n---\n\n`;
    });
    return md;
  };

  const handleDownload = () => {
    const text = getCompiledExportText();
    const blob = new Blob([text], { type: 'text/plain;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    
    const safeTitle = selectedConversation?.title.replace(/[^a-z0-9]/gi, '_').toLowerCase() || 'context';
    a.download = `bridge_context_${safeTitle}.${exportFormat}`;
    a.click();
    URL.revokeObjectURL(url);
    setShowExportModal(false);
  };

  // --- RENDER POPUP COMPACT CONTEXTS VIEW ---
  if (isPopup) {
    if (popupShowDetail && selectedConversation) {
      return (
        <div className="h-full flex flex-col gap-3 font-sans">
          {/* Detail Header */}
          <div className="flex items-center justify-between pb-1 border-b border-cyber-border/20">
            <button 
              onClick={() => setPopupShowDetail(false)}
              className="p-1 rounded-md bg-cyber-card border border-cyber-border hover:border-cyber-primary/30 text-cyber-muted hover:text-cyber-text"
            >
              <ArrowLeft className="w-3.5 h-3.5" />
            </button>
            <span className="text-[10px] font-bold text-cyber-muted tracking-wider uppercase">{selectedConversation.platform}</span>
            <button 
              onClick={handleConfirmDelete}
              className="p-1 rounded-md text-cyber-danger hover:bg-cyber-danger/10"
              title="Delete chat"
            >
              <Trash2 className="w-3.5 h-3.5" />
            </button>
          </div>

          <h3 className="text-xs font-bold text-cyber-text leading-snug line-clamp-2">{selectedConversation.title}</h3>

          {/* Quick Actions */}
          <div className="grid grid-cols-2 gap-2 mt-0.5">
            <button
              onClick={handleMigrateToClaude}
              className="w-full flex items-center justify-center gap-1.5 py-1.5 bg-gradient-to-r from-cyber-primary to-blue-600 hover:from-blue-600 hover:to-cyber-secondary text-white rounded-lg text-[10px] font-bold transition-all"
            >
              <span>Continue in Claude</span>
              <ExternalLink className="w-2.5 h-2.5" />
            </button>
            
            <button
              onClick={() => {
                let compile = '';
                selectedMessages.forEach(m => compile += `[${m.role.toUpperCase()}]: ${m.content}\n\n`);
                handleCopyClipboard(compile, 'quick-copy');
              }}
              className="w-full flex items-center justify-center gap-1 py-1.5 bg-cyber-card border border-cyber-border hover:border-cyber-primary/40 text-cyber-text rounded-lg text-[10px] font-bold transition-all"
            >
              {copiedId === 'quick-copy' ? (
                <>
                  <Check className="w-2.5 h-2.5 text-cyber-accent" />
                  <span className="text-cyber-accent font-semibold">Copied Thread!</span>
                </>
              ) : (
                <>
                  <Copy className="w-2.5 h-2.5" />
                  <span>Copy Content</span>
                </>
              )}
            </button>
          </div>

          {/* Scrolling compact message sequence */}
          <div className="flex-1 overflow-y-auto space-y-3.5 pr-1 py-1 mt-1 border-t border-cyber-border/10">
            {selectedMessages.map((msg) => (
              <div key={msg.id} className="flex flex-col gap-1">
                <span className={`text-[8px] font-mono font-bold tracking-widest uppercase ${
                  msg.role === 'user' ? 'text-cyber-primary' : 'text-cyber-secondary'
                }`}>
                  {msg.role === 'user' ? 'USER' : 'ASSISTANT'}
                </span>
                <div className={`p-2 rounded-lg text-[10px] leading-relaxed break-words border ${
                  msg.role === 'user' 
                    ? 'bg-cyber-primary/5 border-cyber-primary/20 text-cyber-text' 
                    : 'bg-cyber-card border-cyber-border/70 text-cyber-muted'
                }`}>
                  {msg.content.slice(0, 150)}{msg.content.length > 150 && '...'}
                </div>
              </div>
            ))}
          </div>
        </div>
      );
    }

    return (
      <div className="h-full flex flex-col gap-3 font-sans">
        {/* Compact Search Input */}
        <div className="relative">
          <Search className="w-3.5 h-3.5 text-cyber-muted absolute left-2.5 top-2.5" />
          <input
            type="text"
            placeholder="Search matching content..."
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            className="w-full bg-cyber-card border border-cyber-border rounded-lg py-1.5 pl-8 pr-3 text-xs text-cyber-text focus:outline-none focus:border-cyber-primary/40"
          />
        </div>

        {/* Small Platform filters */}
        <div className="flex gap-1 overflow-x-auto pb-1">
          {['all', 'chatgpt', 'claude'].map((p) => (
            <button
              key={p}
              onClick={() => setPlatform(p)}
              className={`px-2.5 py-0.5 rounded text-[9px] font-bold border transition-all uppercase ${
                platform === p 
                  ? 'bg-cyber-primary/10 border-cyber-primary/30 text-cyber-primary' 
                  : 'bg-cyber-card border-cyber-border/50 text-cyber-muted hover:text-cyber-text'
              }`}
            >
              {p}
            </button>
          ))}
        </div>

        {/* Compact Chat Results Scroll */}
        <div className="flex-1 overflow-y-auto space-y-2 pr-1">
          {searchResults.length > 0 ? (
            searchResults.map(({ conversation }) => (
              <div
                key={conversation.id}
                onClick={() => {
                  setSelectedConvoId(conversation.id);
                  setPopupShowDetail(true);
                }}
                className="cyber-glass rounded-lg p-2.5 border border-cyber-border/30 hover:border-cyber-primary/25 cursor-pointer flex justify-between items-center transition-all group"
              >
                <div className="min-w-0 pr-2">
                  <div className="font-bold text-cyber-text truncate text-xs">{conversation.title}</div>
                  <div className="flex gap-2 items-center text-[9px] text-cyber-muted mt-0.5 font-mono">
                    <span className="uppercase text-cyber-primary">{conversation.platform}</span>
                    <span>•</span>
                    <span>{conversation.messageCount} msgs</span>
                  </div>
                </div>
                <ChevronRight className="w-3.5 h-3.5 text-cyber-muted group-hover:text-cyber-primary shrink-0 transition-colors" />
              </div>
            ))
          ) : (
            <p className="text-[10px] text-cyber-muted text-center py-6">No contexts match search.</p>
          )}
        </div>
      </div>
    );
  }

  // --- FULL INTERACTIVE DASHBOARD CONTEXTS VIEW ---
  return (
    <div className="h-[calc(100vh-10rem)] flex flex-col gap-6">
      
      {/* 1. Extended Filters Panel */}
      <div className="cyber-glass rounded-2xl p-4 border border-cyber-border/40 grid grid-cols-5 gap-4 items-end shadow-sm">
        {/* Input search */}
        <div className="col-span-2 flex flex-col gap-1.5">
          <label className="text-[10px] font-bold text-cyber-muted font-mono uppercase">Deep Query Search</label>
          <div className="relative">
            <Search className="w-4 h-4 text-cyber-muted absolute left-3 top-3" />
            <input
              type="text"
              placeholder="Search title, prompt, or code snippets..."
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              className="w-full bg-cyber-bg border border-cyber-border/60 rounded-xl py-2 pl-9 pr-4 text-xs text-cyber-text placeholder-cyber-muted focus:outline-none focus:border-cyber-primary/50"
            />
          </div>
        </div>

        {/* Platform filter */}
        <div className="flex flex-col gap-1.5">
          <label className="text-[10px] font-bold text-cyber-muted font-mono uppercase">Platform</label>
          <select
            value={platform}
            onChange={(e) => setPlatform(e.target.value)}
            className="w-full bg-cyber-bg border border-cyber-border/60 rounded-xl py-2 px-3 text-xs text-cyber-text focus:outline-none focus:border-cyber-primary/50 cursor-pointer"
          >
            <option value="all">ALL PLATFORMS</option>
            <option value="chatgpt">CHATGPT</option>
            <option value="claude">CLAUDE</option>
            <option value="gemini">GEMINI</option>
            <option value="deepseek">DEEPSEEK</option>
          </select>
        </div>

        {/* Project folder filter */}
        <div className="flex flex-col gap-1.5">
          <label className="text-[10px] font-bold text-cyber-muted font-mono uppercase">Project Mapping</label>
          <select
            value={projectId}
            onChange={(e) => setProjectId(e.target.value)}
            className="w-full bg-cyber-bg border border-cyber-border/60 rounded-xl py-2 px-3 text-xs text-cyber-text focus:outline-none focus:border-cyber-primary/50 cursor-pointer"
          >
            <option value="all">ALL PROJECTS</option>
            <option value="unassigned">UNASSIGNED</option>
            {allProjects.map(p => (
              <option key={p.id} value={p.id}>{p.name.toUpperCase()}</option>
            ))}
          </select>
        </div>

        {/* Date Inputs split */}
        <div className="grid grid-cols-2 gap-2">
          <div className="flex flex-col gap-1">
            <label className="text-[9px] font-bold text-cyber-muted font-mono uppercase">Start Date</label>
            <input
              type="date"
              value={startDate}
              onChange={(e) => setStartDate(e.target.value)}
              className="bg-cyber-bg border border-cyber-border/60 rounded-lg p-1.5 text-[10px] text-cyber-text focus:outline-none"
            />
          </div>
          <div className="flex flex-col gap-1">
            <label className="text-[9px] font-bold text-cyber-muted font-mono uppercase">End Date</label>
            <input
              type="date"
              value={endDate}
              onChange={(e) => setEndDate(e.target.value)}
              className="bg-cyber-bg border border-cyber-border/60 rounded-lg p-1.5 text-[10px] text-cyber-text focus:outline-none"
            />
          </div>
        </div>
      </div>

      {/* 2. Main Master-Detail split canvas */}
      <div className="flex-1 grid grid-cols-3 gap-6 min-h-0">
        
        {/* Master List: Conversation Cards */}
        <div className="col-span-1 flex flex-col gap-3 overflow-y-auto pr-2 min-h-0 select-none">
          <h3 className="font-extrabold text-xs font-mono tracking-widest text-cyber-muted uppercase">
            MATCHING CONTEXTS ({searchResults.length})
          </h3>

          {searchResults.length > 0 ? (
            <div className="flex flex-col gap-3">
              {searchResults.map(({ conversation, snippet }) => {
                const isSelected = selectedConvoId === conversation.id;
                return (
                  <div
                    key={conversation.id}
                    onClick={() => setSelectedConvoId(conversation.id)}
                    className={`cyber-glass rounded-xl p-4 border cursor-pointer transition-all flex flex-col gap-2 relative bg-cyber-card/15 ${
                      isSelected 
                        ? 'border-cyber-primary bg-cyber-primary/5 shadow-glow-primary' 
                        : 'border-cyber-border/40 hover:border-cyber-primary/15'
                    }`}
                  >
                    <div className="flex items-center justify-between">
                      <span className="text-[10px] uppercase font-mono font-bold tracking-wider text-cyber-primary/95 bg-cyber-primary/5 border border-cyber-primary/10 px-1.5 py-0.5 rounded">
                        {conversation.platform}
                      </span>
                      <div className="flex items-center gap-1 text-[9px] font-mono text-cyber-muted">
                        <Clock className="w-3 h-3" />
                        <span>
                          {new Date(conversation.updatedAt).toLocaleDateString([], { month: 'short', day: 'numeric' })}
                        </span>
                      </div>
                    </div>

                    <h4 className={`text-xs font-bold leading-relaxed line-clamp-1 ${isSelected ? 'text-cyber-primary' : 'text-cyber-text'}`}>
                      {conversation.title}
                    </h4>

                    {snippet && (
                      <p className="text-[10px] text-cyber-muted font-mono leading-relaxed bg-cyber-bg/30 p-1.5 rounded border border-cyber-border/20 mt-0.5 italic line-clamp-2">
                        {snippet}
                      </p>
                    )}

                    <div className="flex items-center justify-between border-t border-cyber-border/20 pt-2 text-[10px] text-cyber-muted">
                      <span className="flex items-center gap-1">
                        <MessageSquare className="w-3.5 h-3.5" />
                        <span>{conversation.messageCount} turns</span>
                      </span>
                      {conversation.projectId && (
                        <span className="flex items-center gap-1 font-bold text-[9px] text-cyber-accent">
                          <Folder className="w-3 h-3" /> MAPPED
                        </span>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          ) : (
            <div className="border border-dashed border-cyber-border/50 rounded-xl p-8 text-center flex flex-col items-center justify-center bg-cyber-bg/10">
              <MessageSquare className="w-8 h-8 text-cyber-muted/20 mb-2" />
              <p className="text-xs text-cyber-muted font-bold">No Matching Chats</p>
              <p className="text-[10px] text-cyber-muted/70 max-w-[170px] mt-0.5">Try widening filters or entering a simpler query.</p>
            </div>
          )}
        </div>

        {/* Detail Panel: Selected Thread Viewer */}
        <div className="col-span-2 flex flex-col min-h-0 bg-cyber-card/10 border border-cyber-border/40 rounded-2xl p-6 overflow-hidden">
          {selectedConvoId && selectedConversation ? (
            <div className="flex-1 flex flex-col min-h-0 gap-6">
              
              {/* Detail Header bar */}
              <div className="flex justify-between items-start border-b border-cyber-border/30 pb-4">
                <div className="min-w-0 pr-4 flex-1 flex flex-col gap-2">
                  <div className="flex items-center gap-3">
                    <span className="uppercase text-xs font-mono font-bold tracking-widest text-cyber-primary bg-cyber-primary/10 border border-cyber-primary/20 px-2 py-0.5 rounded-lg shadow-sm">
                      {selectedConversation.platform}
                    </span>
                    <a 
                      href={selectedConversation.url} 
                      target="_blank" 
                      rel="noreferrer" 
                      className="text-xs text-cyber-muted hover:text-cyber-primary flex items-center gap-1 font-bold font-mono transition-colors"
                      title="Open source URL on provider website"
                    >
                      <span>Web URL</span>
                      <ExternalLink className="w-3.5 h-3.5" />
                    </a>
                  </div>

                  <h2 className="text-base font-extrabold text-cyber-text leading-snug">
                    {selectedConversation.title}
                  </h2>

                  <div className="flex items-center gap-4 text-xs text-cyber-muted font-mono mt-0.5">
                    <span className="flex items-center gap-1">
                      <CalendarDays className="w-3.5 h-3.5" />
                      <span>{new Date(selectedConversation.capturedAt).toLocaleString()}</span>
                    </span>
                    <span>|</span>
                    <span className="flex items-center gap-1">
                      <Cpu className="w-3.5 h-3.5" />
                      <span>Est. {activeChatTokens} tokens</span>
                    </span>
                  </div>
                </div>

                {/* Header Action controls */}
                <div className="flex flex-col items-end gap-3 shrink-0">
                  <div className="flex items-center gap-2">
                    <button
                      onClick={handleMigrateToClaude}
                      className="flex items-center gap-1.5 px-4 py-2 bg-gradient-to-r from-cyber-primary to-blue-600 hover:from-blue-600 hover:to-cyber-secondary text-white rounded-xl text-xs font-extrabold shadow-md shadow-cyber-primary/15 border border-cyber-primary/25 transition-all"
                    >
                      <span>Continue in Claude</span>
                      <ExternalLink className="w-3.5 h-3.5" />
                    </button>
                    
                    <button
                      onClick={() => setShowExportModal(true)}
                      className="flex items-center gap-1.5 px-3.5 py-2 bg-cyber-bg border border-cyber-border/70 hover:border-cyber-primary/45 text-cyber-text rounded-xl text-xs font-bold transition-all"
                    >
                      <Download className="w-3.5 h-3.5" />
                      <span>Export</span>
                    </button>

                    <button
                      onClick={handleConfirmDelete}
                      className="p-2 bg-cyber-bg border border-cyber-border/70 hover:border-cyber-danger/45 rounded-xl text-cyber-muted hover:text-cyber-danger transition-all"
                      title="Erase context from database"
                    >
                      <Trash2 className="w-4 h-4" />
                    </button>
                  </div>

                  {/* Project Directory picker dropdown */}
                  <div className="flex items-center gap-2 text-xs">
                    <Folder className="w-3.5 h-3.5 text-cyber-primary" />
                    <span className="text-cyber-muted font-bold">Folder mapping:</span>
                    <select
                      value={selectedConversation.projectId || 'unassigned'}
                      onChange={(e) => handleProjectReassign(e.target.value)}
                      className="bg-cyber-bg border border-cyber-border rounded-lg px-2 py-1 text-xs text-cyber-text cursor-pointer focus:outline-none"
                    >
                      <option value="unassigned">UNASSIGNED</option>
                      {allProjects.map(p => (
                        <option key={p.id} value={p.id}>{p.name.toUpperCase()}</option>
                      ))}
                    </select>
                  </div>
                </div>
              </div>

              {/* Chat bubble messages thread container */}
              <div className="flex-1 overflow-y-auto space-y-5 pr-2 py-2 min-h-0 select-text">
                {selectedMessages.map((msg) => {
                  const isUser = msg.role === 'user';
                  return (
                    <div 
                      key={msg.id} 
                      className={`flex flex-col gap-1.5 max-w-[85%] ${
                        isUser ? 'ml-auto items-end' : 'mr-auto items-start'
                      }`}
                    >
                      <div className="flex items-center gap-2 text-[10px] font-bold font-mono tracking-widest text-cyber-muted uppercase">
                        <span>{isUser ? 'USER' : 'ASSISTANT'}</span>
                        <span>•</span>
                        <span>{new Date(msg.timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}</span>
                      </div>
                      
                      <div 
                        className={`p-4 rounded-2xl text-sm leading-relaxed whitespace-pre-wrap border break-words shadow-sm markdown-body ${
                          isUser 
                            ? 'bg-cyber-primary/5 border-cyber-primary/20 text-cyber-text rounded-tr-none' 
                            : 'bg-cyber-card/65 border-cyber-border/75 text-cyber-muted rounded-tl-none'
                        }`}
                      >
                        {msg.content}
                      </div>
                    </div>
                  );
                })}
              </div>

            </div>
          ) : (
            <div className="flex-1 flex flex-col items-center justify-center text-center p-10 select-none">
              <FileText className="w-12 h-12 text-cyber-muted/20 mb-3 animate-bounce" />
              <h3 className="text-sm font-bold text-cyber-text">Context Thread Unopened</h3>
              <p className="text-xs text-cyber-muted max-w-sm mt-1">
                Select one of the archived contexts from the left menu list to inspect message blocks, export formats, adjust folder mappings or trigger Claude injection.
              </p>
            </div>
          )}
        </div>

      </div>

      {/* Export Options Modal overlay */}
      {showExportModal && (
        <div className="fixed inset-0 bg-cyber-bg/80 backdrop-blur-sm flex items-center justify-center z-50 p-4">
          <div className="cyber-glass rounded-2xl p-6 border border-cyber-primary/25 w-full max-w-md shadow-glass animate-in fade-in zoom-in-95 duration-150">
            <div className="flex justify-between items-center border-b border-cyber-border/30 pb-3 mb-4">
              <h3 className="font-extrabold text-sm font-mono text-cyber-primary flex items-center gap-2">
                <Download className="w-5 h-5" /> COMPILE CONTEXT EXPORT
              </h3>
              <button 
                onClick={() => setShowExportModal(false)} 
                className="p-1 bg-cyber-bg border border-cyber-border rounded-lg text-cyber-muted hover:text-cyber-danger hover:border-cyber-danger transition-colors"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <div className="space-y-4">
              <div className="flex flex-col gap-2">
                <label className="text-xs font-bold text-cyber-muted font-mono uppercase">File Format</label>
                <div className="grid grid-cols-3 gap-2">
                  {(['md', 'json', 'txt'] as const).map((fmt) => (
                    <button
                      key={fmt}
                      onClick={() => setExportFormat(fmt)}
                      className={`py-2 rounded-xl text-xs font-bold border transition-all uppercase ${
                        exportFormat === fmt 
                          ? 'bg-cyber-primary/10 border-cyber-primary/40 text-cyber-primary' 
                          : 'bg-cyber-bg border-cyber-border text-cyber-muted hover:text-cyber-text'
                      }`}
                    >
                      {fmt === 'md' ? 'Markdown' : fmt === 'json' ? 'JSON Data' : 'Plain Text'}
                    </button>
                  ))}
                </div>
              </div>

              <p className="text-[11px] text-cyber-muted leading-relaxed font-sans bg-cyber-bg/40 p-3 rounded-lg border border-cyber-border/30">
                {exportFormat === 'md' && 'Generates stylized markdown documentation, containing headers, bullets, and hyperlinks ideal for documentation hubs.'}
                {exportFormat === 'json' && 'Generates highly structured raw JSON payloads, incorporating timestamps, platform properties, and ordered arrays.'}
                {exportFormat === 'txt' && 'Generates highly readable plain txt threads, perfect for copy pasting into legacy engines.'}
              </p>

              <div className="flex gap-3 justify-end pt-3">
                <button
                  onClick={() => {
                    const text = getCompiledExportText();
                    handleCopyClipboard(text, 'modal-copy');
                  }}
                  className="px-4 py-2 border border-cyber-border rounded-xl text-xs font-bold text-cyber-text hover:border-cyber-primary/40 flex items-center gap-1.5 transition-all"
                >
                  {copiedId === 'modal-copy' ? (
                    <>
                      <Check className="w-3.5 h-3.5 text-cyber-accent" />
                      <span className="text-cyber-accent">Copied to Clipboard!</span>
                    </>
                  ) : (
                    <>
                      <Copy className="w-3.5 h-3.5" />
                      <span>Copy to Clipboard</span>
                    </>
                  )}
                </button>
                
                <button
                  onClick={handleDownload}
                  className="px-5 py-2 bg-cyber-primary hover:bg-blue-600 text-white rounded-xl text-xs font-bold shadow-md shadow-cyber-primary/20 transition-all"
                >
                  Download File
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

    </div>
  );
}
