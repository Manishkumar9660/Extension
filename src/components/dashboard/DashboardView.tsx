import { useState } from 'react';
import { useLiveQuery } from 'dexie-react-hooks';
import { db } from '../../services/db';
import { formatTokenMetric } from '../../services/token';
import { 
  MessageSquare, 
  Folder, 
  Cpu, 
  ArrowRight, 
  History, 
  Sparkles, 
  ExternalLink,
  Copy,
  Check,
  Zap,
  Globe
} from 'lucide-react';

interface DashboardViewProps {
  isPopup: boolean;
  setView: (view: 'dashboard' | 'projects' | 'contexts' | 'settings') => void;
}

export default function DashboardView({ isPopup, setView }: DashboardViewProps) {
  const [copiedId, setCopiedId] = useState<string | null>(null);

  // --- Reactive Database Queries ---
  const totalChats = useLiveQuery(() => db.conversations.count()) ?? 0;
  const totalProjects = useLiveQuery(() => db.projects.count()) ?? 0;
  
  const recentChats = useLiveQuery(async () => {
    const list = await db.conversations.orderBy('updatedAt').reverse().limit(isPopup ? 3 : 5).toArray();
    // Decrypt titles for display
    const decryptPromises = list.map(async (convo) => {
      // Find key if active
      let decryptedTitle = convo.title;
      if (convo.title.startsWith('enc:')) {
        // Safe check
        try {
          const keyRes = await new Promise<any>((resolve) => {
            if (typeof chrome !== 'undefined' && chrome.storage && chrome.storage.local) {
              chrome.storage.local.get(['encryptionEnabled', 'masterKeyJwk'], resolve);
            } else {
              resolve({
                encryptionEnabled: localStorage.getItem('encryptionEnabled') === 'true',
                masterKeyJwk: JSON.parse(localStorage.getItem('masterKeyJwk') || 'null')
              });
            }
          });
          if (keyRes.encryptionEnabled && keyRes.masterKeyJwk) {
            const { importKeyFromJWK, decryptText } = await import('../../services/crypto');
            const key = await importKeyFromJWK(keyRes.masterKeyJwk);
            decryptedTitle = await decryptText(convo.title.replace('enc:', ''), key);
          } else {
            decryptedTitle = '[Encrypted Chat]';
          }
        } catch {
          decryptedTitle = '[Encrypted Chat]';
        }
      }
      return { ...convo, title: decryptedTitle };
    });
    return Promise.all(decryptPromises);
  }) ?? [];

  const estimatedTokensTotal = useLiveQuery(async () => {
    const messages = await db.messages.toArray();
    let sum = 0;
    
    // Quick estimation on stored content lengths
    // Using simple heuristic to avoid massive memory decryption overhead in dashboard counters
    messages.forEach((msg) => {
      // Strips enc marker overhead
      const contentLen = msg.content.startsWith('enc:') ? msg.content.length * 0.75 : msg.content.length; 
      sum += Math.max(1, Math.round(contentLen / 4.0));
    });
    return sum;
  }) ?? 0;

  // Compute Platform Counts
  const platformStats = useLiveQuery(async () => {
    const convos = await db.conversations.toArray();
    const counts = { chatgpt: 0, claude: 0, gemini: 0, deepseek: 0 };
    convos.forEach((c) => {
      if (counts[c.platform] !== undefined) {
        counts[c.platform]++;
      }
    });
    return counts;
  }) ?? { chatgpt: 0, claude: 0, gemini: 0, deepseek: 0 };

  const handleCopyText = (id: string, text: string) => {
    navigator.clipboard.writeText(text);
    setCopiedId(id);
    setTimeout(() => setCopiedId(null), 2000);
  };

  const handleMigrate = (convoId: string) => {
    db.messages.where('conversationId').equals(convoId).sortBy('index').then(async (msgs) => {
      if (msgs.length === 0) return;
      
      // Decrypt messages if encrypted
      const decryptedMsgs = [];
      const { decryptMessageContent, getActiveCryptoKey } = await import('../../services/db');
      const key = await getActiveCryptoKey();
      
      for (const m of msgs) {
        decryptedMsgs.push({
          ...m,
          content: await decryptMessageContent(m.content, key)
        });
      }

      // Format clean context thread
      const conversation = await db.conversations.get(convoId);
      const platformName = conversation?.platform.toUpperCase() || 'CHAT';
      const project = conversation?.projectId ? await db.projects.get(conversation.projectId) : null;
      const projectName = project ? project.name : 'UNASSIGNED';

      let formattedText = `=== AI CONTEXT BRIDGE: CONTINUING PROJECT [${projectName}] ===\n`;
      formattedText += `Migrating conversation captured from ${platformName}\n\n`;
      
      decryptedMsgs.forEach((msg) => {
        const roleName = msg.role === 'user' ? 'USER' : 'AI ASSISTANT';
        formattedText += `[${roleName}]:\n${msg.content}\n\n`;
      });
      
      formattedText += `=== END OF CAPTURED CONTEXT ===\n`;
      formattedText += `Please analyze the conversation sequence above and wait for my next instructions.`;

      // Trigger redirect messaging
      if (typeof chrome !== 'undefined' && chrome.runtime && chrome.runtime.sendMessage) {
        chrome.runtime.sendMessage({
          type: 'CONTINUE_IN_CLAUDE',
          data: { formattedContext: formattedText }
        });
      }
    });
  };

  // --- RENDER POPUP COMPACT DASHBOARD ---
  if (isPopup) {
    const latestChat = recentChats[0];

    return (
      <div className="h-full flex flex-col gap-3.5 text-cyber-text">
        {/* Status Hub Indicator */}
        <div className="cyber-glass rounded-xl p-3 border border-cyber-border/40 relative overflow-hidden">
          <div className="absolute top-0 right-0 w-24 h-24 bg-cyber-primary/10 rounded-full blur-2xl -z-10" />
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <Zap className="w-4 h-4 text-cyber-primary animate-bounce" />
              <span className="text-[11px] font-mono tracking-wider font-semibold text-cyber-muted">MONITOR STATUS</span>
            </div>
            <div className="flex items-center gap-1.5 bg-cyber-accent/10 px-2 py-0.5 rounded-full border border-cyber-accent/25">
              <span className="w-1.5 h-1.5 rounded-full bg-cyber-accent animate-ping" />
              <span className="text-[9px] font-bold text-cyber-accent">GPT ACTIVE</span>
            </div>
          </div>
          <p className="text-[10px] mt-1.5 text-cyber-muted">
            Bridge watches DOM mutations on ChatGPT to automatically sync prompts.
          </p>
        </div>

        {/* Small Statistics Cards Grid */}
        <div className="grid grid-cols-3 gap-2">
          <div className="cyber-glass rounded-xl p-2.5 flex flex-col items-center justify-center border border-cyber-border/30 hover:border-cyber-primary/30 transition-all">
            <MessageSquare className="w-3.5 h-3.5 text-cyber-primary mb-1" />
            <span className="text-sm font-extrabold font-mono">{totalChats}</span>
            <span className="text-[9px] text-cyber-muted font-medium">Saved Chats</span>
          </div>
          
          <div className="cyber-glass rounded-xl p-2.5 flex flex-col items-center justify-center border border-cyber-border/30 hover:border-cyber-secondary/30 transition-all">
            <Cpu className="w-3.5 h-3.5 text-cyber-secondary mb-1" />
            <span className="text-sm font-extrabold font-mono">{formatTokenMetric(estimatedTokensTotal)}</span>
            <span className="text-[9px] text-cyber-muted font-medium">Est. Tokens</span>
          </div>

          <div className="cyber-glass rounded-xl p-2.5 flex flex-col items-center justify-center border border-cyber-border/30 hover:border-cyber-accent/30 transition-all">
            <Folder className="w-3.5 h-3.5 text-cyber-accent mb-1" />
            <span className="text-sm font-extrabold font-mono">{totalProjects}</span>
            <span className="text-[9px] text-cyber-muted font-medium font-sans">Folders</span>
          </div>
        </div>

        {/* Last Scraped Item Capsule */}
        <div className="flex-1 flex flex-col min-h-0">
          <div className="flex justify-between items-center mb-1.5">
            <h3 className="text-[10px] font-bold tracking-widest font-mono text-cyber-muted uppercase flex items-center gap-1">
              <History className="w-3 h-3 text-cyber-primary" /> Last Captured Session
            </h3>
            {totalChats > 3 && (
              <button 
                onClick={() => setView('contexts')} 
                className="text-[9px] text-cyber-primary hover:text-cyber-secondary flex items-center gap-0.5 font-bold"
              >
                View all ({totalChats}) <ArrowRight className="w-2.5 h-2.5" />
              </button>
            )}
          </div>

          {latestChat ? (
            <div className="cyber-glass rounded-xl p-3 border border-cyber-border/40 hover:border-cyber-primary/20 transition-all flex flex-col gap-2.5 bg-cyber-card/50">
              <div className="flex items-center justify-between">
                <span className="text-[10px] font-semibold text-cyber-muted uppercase px-2 py-0.5 bg-cyber-primary/10 border border-cyber-primary/20 rounded-md">
                  {latestChat.platform}
                </span>
                <span className="text-[9px] font-mono text-cyber-muted">
                  {new Date(latestChat.updatedAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                </span>
              </div>
              
              <h4 className="text-xs font-bold text-cyber-text truncate pr-2">
                {latestChat.title}
              </h4>

              <div className="flex items-center justify-between border-t border-cyber-border/20 pt-2 text-[9px] text-cyber-muted">
                <span>{latestChat.messageCount} messages</span>
                <span>{latestChat.url.includes('/c/') ? 'Synced ID' : 'Capture Active'}</span>
              </div>

              {/* Action grid */}
              <div className="grid grid-cols-2 gap-2 mt-0.5">
                <button
                  onClick={() => handleMigrate(latestChat.id)}
                  className="w-full flex items-center justify-center gap-1 py-1.5 bg-gradient-to-r from-cyber-primary to-blue-600 hover:from-blue-600 hover:to-cyber-secondary text-white rounded-lg text-[10px] font-bold shadow-md shadow-cyber-primary/25 border border-cyber-primary/20 transition-all"
                >
                  <span>Continue in Claude</span>
                  <ExternalLink className="w-2.5 h-2.5" />
                </button>
                
                <button
                  onClick={() => {
                    db.messages.where('conversationId').equals(latestChat.id).sortBy('index').then(async (msgs) => {
                      const { decryptMessageContent, getActiveCryptoKey } = await import('../../services/db');
                      const key = await getActiveCryptoKey();
                      let contentBlock = '';
                      for (const m of msgs) {
                        contentBlock += `[${m.role.toUpperCase()}]: ${await decryptMessageContent(m.content, key)}\n\n`;
                      }
                      handleCopyText(latestChat.id, contentBlock);
                    });
                  }}
                  className="w-full flex items-center justify-center gap-1 py-1.5 bg-cyber-card border border-cyber-border/70 hover:border-cyber-primary/40 text-cyber-text rounded-lg text-[10px] font-bold transition-all"
                >
                  {copiedId === latestChat.id ? (
                    <>
                      <Check className="w-2.5 h-2.5 text-cyber-accent" />
                      <span className="text-cyber-accent">Copied!</span>
                    </>
                  ) : (
                    <>
                      <Copy className="w-2.5 h-2.5" />
                      <span>Copy Thread</span>
                    </>
                  )}
                </button>
              </div>
            </div>
          ) : (
            <div className="flex-1 flex flex-col items-center justify-center border border-dashed border-cyber-border/40 rounded-xl p-4 text-center">
              <Sparkles className="w-6 h-6 text-cyber-muted/30 mb-2 animate-pulse" />
              <p className="text-xs text-cyber-muted font-medium">No conversations captured yet.</p>
              <p className="text-[10px] text-cyber-muted/65 mt-1 max-w-[200px]">
                Open ChatGPT web interface and chat to capture contexts automatically!
              </p>
            </div>
          )}
        </div>
      </div>
    );
  }

  // --- RENDER FULL DASHBOARD PAGE ---
  return (
    <div className="flex flex-col gap-8">
      {/* Visual Header Welcome Card */}
      <div className="cyber-glass rounded-2xl p-6 border border-cyber-border/40 relative overflow-hidden flex items-center justify-between shadow-glass">
        {/* Glow element */}
        <div className="absolute -left-10 top-0 w-48 h-48 bg-cyber-primary/10 rounded-full blur-[60px]" />
        <div className="absolute -right-10 bottom-0 w-48 h-48 bg-cyber-secondary/15 rounded-full blur-[60px]" />
        
        <div className="flex flex-col gap-1.5 z-10">
          <div className="flex items-center gap-2 text-cyber-primary">
            <Sparkles className="w-4 h-4" />
            <span className="text-xs font-mono font-bold tracking-widest uppercase">BRIDGE CO-PILOT ACTIVE</span>
          </div>
          <h1 className="text-2xl font-extrabold tracking-tight bg-gradient-to-r from-cyber-text via-cyber-text to-cyber-muted bg-clip-text text-transparent">
            Preserve & Continue conversations seamlessly
          </h1>
          <p className="text-sm text-cyber-muted max-w-xl">
            Maintain AI context when transferring projects across Claude and ChatGPT. All stored securely, completely offline inside your browser's sandboxed environment.
          </p>
        </div>

        <div className="flex items-center gap-3 shrink-0 z-10">
          <div className="cyber-glass border-cyber-border/50 rounded-xl px-4 py-3 text-center min-w-[100px] hover:border-cyber-primary/20 transition-all shadow-sm">
            <Globe className="w-4 h-4 text-cyber-accent mx-auto mb-1 animate-pulse" />
            <div className="text-[9px] font-bold text-cyber-muted tracking-wider">OFFLINE MODE</div>
            <div className="text-xs font-black text-cyber-accent font-mono mt-0.5">LOCAL CORE</div>
          </div>
        </div>
      </div>

      {/* Grid of Three Statistics widgets */}
      <div className="grid grid-cols-3 gap-6">
        {/* Stat 1 */}
        <div className="cyber-glass rounded-2xl p-5 border border-cyber-border/30 cyber-border-glow-primary relative overflow-hidden">
          <div className="absolute top-4 right-4 p-2 bg-cyber-primary/5 rounded-lg border border-cyber-primary/15">
            <MessageSquare className="w-5 h-5 text-cyber-primary" />
          </div>
          <span className="text-xs font-semibold text-cyber-muted uppercase tracking-widest font-mono">Bridges Captured</span>
          <h2 className="text-3xl font-extrabold font-mono mt-2 text-cyber-text">{totalChats}</h2>
          <div className="mt-3 flex items-center gap-1.5 text-xs text-cyber-muted">
            <span className="w-1.5 h-1.5 rounded-full bg-cyber-primary" />
            <span>Real-time DOM monitors hooked</span>
          </div>
        </div>

        {/* Stat 2 */}
        <div className="cyber-glass rounded-2xl p-5 border border-cyber-border/30 cyber-border-glow-secondary relative overflow-hidden">
          <div className="absolute top-4 right-4 p-2 bg-cyber-secondary/5 rounded-lg border border-cyber-secondary/15">
            <Cpu className="w-5 h-5 text-cyber-secondary" />
          </div>
          <span className="text-xs font-semibold text-cyber-muted uppercase tracking-widest font-mono">Token Vault</span>
          <h2 className="text-3xl font-extrabold font-mono mt-2 text-cyber-text">{formatTokenMetric(estimatedTokensTotal)}</h2>
          <div className="mt-3 flex items-center gap-1.5 text-xs text-cyber-muted">
            <span className="w-1.5 h-1.5 rounded-full bg-cyber-secondary animate-pulse" />
            <span>Tokens parsed offline</span>
          </div>
        </div>

        {/* Stat 3 */}
        <div className="cyber-glass rounded-2xl p-5 border border-cyber-border/30 cyber-border-glow-accent relative overflow-hidden">
          <div className="absolute top-4 right-4 p-2 bg-cyber-accent/5 rounded-lg border border-cyber-accent/15">
            <Folder className="w-5 h-5 text-cyber-accent" />
          </div>
          <span className="text-xs font-semibold text-cyber-muted uppercase tracking-widest font-mono">Active Projects</span>
          <h2 className="text-3xl font-extrabold font-mono mt-2 text-cyber-text">{totalProjects}</h2>
          <div className="mt-3 flex items-center gap-1.5 text-xs text-cyber-muted">
            <span className="w-1.5 h-1.5 rounded-full bg-cyber-accent" />
            <span>Folder directories mapped</span>
          </div>
        </div>
      </div>

      {/* Main split grid: Analytics & Activity */}
      <div className="grid grid-cols-3 gap-6">
        {/* Left Side: Recent Activity (Spans 2 columns) */}
        <div className="col-span-2 flex flex-col gap-4">
          <div className="flex justify-between items-center">
            <h3 className="font-extrabold text-sm font-mono tracking-widest text-cyber-muted uppercase flex items-center gap-2">
              <History className="w-4 h-4 text-cyber-primary" /> RECENT CONTEXT BRIDGES
            </h3>
            <button 
              onClick={() => setView('contexts')} 
              className="text-xs text-cyber-primary hover:text-cyber-secondary flex items-center gap-1 font-bold transition-all"
            >
              Browse All Contexts ({totalChats}) <ArrowRight className="w-3.5 h-3.5" />
            </button>
          </div>

          {recentChats.length > 0 ? (
            <div className="flex flex-col gap-4">
              {recentChats.map((convo) => (
                <div 
                  key={convo.id}
                  className="cyber-glass rounded-xl p-4 border border-cyber-border/40 hover:border-cyber-primary/20 transition-all flex items-center justify-between bg-cyber-card/30 group"
                >
                  <div className="flex items-center gap-4 min-w-0">
                    <div className="w-10 h-10 rounded-lg bg-cyber-bg border border-cyber-border/60 flex items-center justify-center uppercase font-mono font-black text-xs text-cyber-primary shadow-sm shrink-0">
                      {convo.platform.slice(0, 2)}
                    </div>
                    
                    <div className="min-w-0 flex flex-col gap-1">
                      <h4 className="text-sm font-bold text-cyber-text truncate group-hover:text-cyber-primary transition-colors">
                        {convo.title}
                      </h4>
                      <div className="flex items-center gap-3 text-xs text-cyber-muted">
                        <span className="uppercase text-[9px] tracking-wider font-semibold text-cyber-primary/95 font-mono px-1.5 py-0.5 bg-cyber-primary/5 border border-cyber-primary/10 rounded">
                          {convo.platform}
                        </span>
                        <span>•</span>
                        <span>{convo.messageCount} turns</span>
                        <span>•</span>
                        <span>{new Date(convo.updatedAt).toLocaleString()}</span>
                      </div>
                    </div>
                  </div>

                  <div className="flex items-center gap-2 shrink-0">
                    <button
                      onClick={() => handleMigrate(convo.id)}
                      className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-cyber-primary/10 border border-cyber-primary/20 text-cyber-primary hover:bg-cyber-primary hover:text-white text-xs font-bold transition-all shadow-sm"
                      title="Inject context automatically in Claude"
                    >
                      <span>Continue in Claude</span>
                      <ExternalLink className="w-3 h-3" />
                    </button>
                    
                    <button
                      onClick={() => {
                        db.messages.where('conversationId').equals(convo.id).sortBy('index').then(async (msgs) => {
                          const { decryptMessageContent, getActiveCryptoKey } = await import('../../services/db');
                          const key = await getActiveCryptoKey();
                          let contentBlock = '';
                          for (const m of msgs) {
                            contentBlock += `[${m.role.toUpperCase()}]: ${await decryptMessageContent(m.content, key)}\n\n`;
                          }
                          handleCopyText(convo.id, contentBlock);
                        });
                      }}
                      className="p-2 rounded-lg bg-cyber-card border border-cyber-border/60 hover:border-cyber-primary/40 text-cyber-muted hover:text-cyber-text transition-all"
                      title="Copy full context markdown thread"
                    >
                      {copiedId === convo.id ? (
                        <Check className="w-4 h-4 text-cyber-accent animate-pulse" />
                      ) : (
                        <Copy className="w-4 h-4" />
                      )}
                    </button>
                  </div>
                </div>
              ))}
            </div>
          ) : (
            <div className="border border-dashed border-cyber-border/50 rounded-2xl p-10 text-center flex flex-col items-center justify-center">
              <Sparkles className="w-8 h-8 text-cyber-muted/30 mb-3 animate-pulse" />
              <h4 className="text-sm font-bold text-cyber-text">No Captured Contexts</h4>
              <p className="text-xs text-cyber-muted max-w-sm mt-1">
                Open `https://chatgpt.com` in a browser tab. The Context Bridge HUD will mount and sync your chats reactively!
              </p>
            </div>
          )}
        </div>

        {/* Right Side: Charts & Platforms (Spans 1 column) */}
        <div className="flex flex-col gap-4">
          <h3 className="font-extrabold text-sm font-mono tracking-widest text-cyber-muted uppercase flex items-center gap-2">
            <Cpu className="w-4 h-4 text-cyber-secondary" /> BALANCES
          </h3>

          <div className="cyber-glass rounded-2xl p-5 border border-cyber-border/40 flex flex-col gap-4 bg-cyber-card/45">
            <h4 className="text-xs font-bold text-cyber-muted tracking-wider uppercase font-mono border-b border-cyber-border/30 pb-2">
              Platform Distribution
            </h4>

            {/* Custom Bar Graphs for Balances */}
            <div className="space-y-3.5">
              {Object.entries(platformStats).map(([platform, count]) => {
                const total = Math.max(1, Object.values(platformStats).reduce((a, b) => a + b, 0));
                const percentage = Math.round((count / total) * 100);
                
                return (
                  <div key={platform} className="flex flex-col gap-1.5">
                    <div className="flex justify-between text-xs font-semibold">
                      <span className="capitalize text-cyber-text">{platform}</span>
                      <span className="font-mono text-cyber-muted">{count} chats ({percentage}%)</span>
                    </div>
                    {/* Bar background */}
                    <div className="h-2 w-full bg-cyber-bg rounded-full border border-cyber-border/50 overflow-hidden relative">
                      <div 
                        className={`h-full rounded-full transition-all duration-500 ${
                          platform === 'chatgpt' 
                            ? 'bg-gradient-to-r from-emerald-500 to-cyber-accent' 
                            : platform === 'claude' 
                            ? 'bg-gradient-to-r from-amber-500 to-orange-500' 
                            : 'bg-gradient-to-r from-cyber-primary to-cyber-secondary'
                        }`}
                        style={{ width: `${percentage}%` }}
                      />
                    </div>
                  </div>
                );
              })}
            </div>
            
            <div className="border-t border-cyber-border/20 pt-3 text-[11px] text-cyber-muted flex items-center gap-1.5">
              <Sparkles className="w-3.5 h-3.5 text-cyber-secondary animate-pulse" />
              <span>Continue in Claude supports zero-API automated parsing.</span>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
