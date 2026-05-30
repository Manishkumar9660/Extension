import { useState } from 'react';
import { useLiveQuery } from 'dexie-react-hooks';
import { 
  db, 
  createProject, 
  renameProject, 
  deleteProject, 
  moveConversationToProject
} from '../../services/db';
import { 
  FolderPlus, 
  Folder, 
  FolderOpen,
  Search, 
  Edit3, 
  Trash2, 
  Plus, 
  ArrowLeft, 
  Check, 
  X,
  FileText,
  Briefcase,
  ChevronRight,
  Info
} from 'lucide-react';

interface ProjectsViewProps {
  isPopup: boolean;
}

export default function ProjectsView({ isPopup }: ProjectsViewProps) {
  // Modal / Form States
  const [showCreateModal, setShowCreateModal] = useState(false);
  const [projectName, setProjectName] = useState('');
  const [projectDesc, setProjectDesc] = useState('');
  const [searchQuery, setSearchQuery] = useState('');
  
  // Active Project Detail Inspector State
  const [selectedProjectId, setSelectedProjectId] = useState<string | null>(null);
  const [isEditingProject, setIsEditingProject] = useState(false);
  const [editName, setEditName] = useState('');
  const [editDesc, setEditDesc] = useState('');

  // --- Reactive Queries ---
  const projects = useLiveQuery(async () => {
    const list = await db.projects.toArray();
    return list.filter(p => 
      p.name.toLowerCase().includes(searchQuery.toLowerCase()) || 
      p.description.toLowerCase().includes(searchQuery.toLowerCase())
    );
  }, [searchQuery]) ?? [];

  const unassignedConvos = useLiveQuery(async () => {
    const list = await db.conversations.where('projectId').equals(null as any).toArray();
    
    // Decrypt conversation titles
    const decryptPromises = list.map(async (convo) => {
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
    });
    return Promise.all(decryptPromises);
  }) ?? [];

  const activeProject = useLiveQuery(async () => {
    if (!selectedProjectId) return undefined;
    return await db.projects.get(selectedProjectId);
  }, [selectedProjectId]);

  const projectConversations = useLiveQuery(async () => {
    if (!selectedProjectId) return [];
    const list = await db.conversations.where('projectId').equals(selectedProjectId).toArray();
    
    // Decrypt conversation titles
    const decryptPromises = list.map(async (convo) => {
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
    });
    return Promise.all(decryptPromises);
  }, [selectedProjectId]) ?? [];

  // --- CRUD Handlers ---

  const handleCreateProject = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!projectName.trim()) return;
    try {
      await createProject(projectName.trim(), projectDesc.trim());
      setProjectName('');
      setProjectDesc('');
      setShowCreateModal(false);
    } catch (e) {
      console.error(e);
    }
  };

  const handleSaveEdit = async () => {
    if (!selectedProjectId || !editName.trim()) return;
    await renameProject(selectedProjectId, editName.trim(), editDesc.trim());
    setIsEditingProject(false);
  };

  const handleDelete = async () => {
    if (!selectedProjectId || !confirm('Are you sure you want to delete this project? Conversations will be safely kept and moved to Unassigned.')) return;
    await deleteProject(selectedProjectId);
    setSelectedProjectId(null);
    setIsEditingProject(false);
  };

  const handleAssignChat = async (chatId: string, projectId: string | null) => {
    await moveConversationToProject(chatId, projectId);
  };

  // --- COMPACT POPUP LAYOUT ---
  if (isPopup) {
    if (selectedProjectId && activeProject) {
      return (
        <div className="h-full flex flex-col gap-3 font-sans">
          {/* Header */}
          <div className="flex items-center gap-2 pb-1 border-b border-cyber-border/20">
            <button 
              onClick={() => setSelectedProjectId(null)}
              className="p-1 rounded-md bg-cyber-card border border-cyber-border hover:border-cyber-primary/40 text-cyber-muted hover:text-cyber-text"
            >
              <ArrowLeft className="w-3.5 h-3.5" />
            </button>
            <h3 className="text-xs font-bold text-cyber-text truncate">{activeProject.name}</h3>
          </div>

          {/* Project chat list */}
          <div className="flex-1 overflow-y-auto space-y-2 pr-1">
            {projectConversations.length > 0 ? (
              projectConversations.map((c) => (
                <div key={c.id} className="cyber-glass rounded-lg p-2.5 border border-cyber-border/30 flex justify-between items-center text-xs">
                  <div className="min-w-0">
                    <div className="font-bold text-cyber-text truncate">{c.title}</div>
                    <div className="text-[9px] text-cyber-muted mt-0.5 uppercase tracking-wider">{c.platform}</div>
                  </div>
                  <button 
                    onClick={() => handleAssignChat(c.id, null)}
                    className="p-1 rounded bg-cyber-card border border-cyber-border text-cyber-danger hover:border-cyber-danger/35"
                    title="Remove from folder"
                  >
                    <X className="w-3 h-3" />
                  </button>
                </div>
              ))
            ) : (
              <p className="text-[10px] text-cyber-muted text-center py-6">This folder is empty.</p>
            )}
          </div>
        </div>
      );
    }

    return (
      <div className="h-full flex flex-col gap-3 font-sans">
        {/* Header Search */}
        <div className="flex gap-2">
          <div className="relative flex-1">
            <Search className="w-3.5 h-3.5 text-cyber-muted absolute left-2.5 top-2.5" />
            <input
              type="text"
              placeholder="Search folders..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="w-full bg-cyber-card border border-cyber-border/80 rounded-lg py-1.5 pl-8 pr-3 text-xs text-cyber-text focus:outline-none focus:border-cyber-primary/50"
            />
          </div>
          <button 
            onClick={() => setShowCreateModal(!showCreateModal)}
            className="p-2 bg-cyber-primary text-white rounded-lg border border-cyber-primary/30"
          >
            <FolderPlus className="w-3.5 h-3.5" />
          </button>
        </div>

        {/* Modal Inline form */}
        {showCreateModal && (
          <form onSubmit={handleCreateProject} className="cyber-glass rounded-xl p-3 border border-cyber-primary/20 space-y-2 flex flex-col">
            <input
              type="text"
              placeholder="Folder Name..."
              value={projectName}
              onChange={(e) => setProjectName(e.target.value)}
              className="w-full bg-cyber-bg border border-cyber-border/70 rounded-md px-2 py-1 text-xs text-cyber-text focus:outline-none"
              required
            />
            <button
              type="submit"
              className="w-full py-1 bg-cyber-primary text-white rounded-md text-xs font-bold"
            >
              Create Folder
            </button>
          </form>
        )}

        {/* List of folders */}
        <div className="flex-1 overflow-y-auto space-y-2 pr-1">
          {projects.length > 0 ? (
            projects.map((p) => (
              <div 
                key={p.id} 
                onClick={() => {
                  setSelectedProjectId(p.id);
                  setEditName(p.name);
                  setEditDesc(p.description);
                }}
                className="cyber-glass rounded-lg p-2.5 border border-cyber-border/30 hover:border-cyber-primary/25 cursor-pointer flex justify-between items-center transition-all group"
              >
                <div className="flex items-center gap-2.5 min-w-0">
                  <Folder className="w-4 h-4 text-cyber-primary shrink-0" />
                  <span className="text-xs font-bold text-cyber-text truncate">{p.name}</span>
                </div>
                <ChevronRight className="w-3.5 h-3.5 text-cyber-muted group-hover:text-cyber-primary transition-colors" />
              </div>
            ))
          ) : (
            <p className="text-[10px] text-cyber-muted text-center py-6">No folders found.</p>
          )}
        </div>
      </div>
    );
  }

  // --- FULL INTERACTIVE DASHBOARD PROJECTS VIEW ---
  return (
    <div className="flex flex-col gap-8 h-full">
      {/* Search and creation controls bar */}
      <div className="flex justify-between items-center bg-cyber-card/10 border border-cyber-border/30 p-4 rounded-2xl backdrop-blur-md">
        <div className="relative w-80">
          <Search className="w-4 h-4 text-cyber-muted absolute left-3 top-3" />
          <input
            type="text"
            placeholder="Search folders by keyword..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="w-full bg-cyber-bg border border-cyber-border/60 rounded-xl py-2 pl-9 pr-4 text-sm text-cyber-text placeholder-cyber-muted focus:outline-none focus:border-cyber-primary/60 focus:shadow-glow-primary transition-all"
          />
        </div>

        <button
          onClick={() => setShowCreateModal(true)}
          className="flex items-center gap-2 px-4 py-2.5 bg-gradient-to-r from-cyber-primary to-blue-600 hover:from-blue-600 hover:to-cyber-secondary text-white rounded-xl text-xs font-bold shadow-md shadow-cyber-primary/10 border border-cyber-primary/25 transition-all"
        >
          <FolderPlus className="w-4 h-4" />
          <span>New Project Folder</span>
        </button>
      </div>

      {/* Inline Creation Overlay Card */}
      {showCreateModal && (
        <div className="fixed inset-0 bg-cyber-bg/85 backdrop-blur-sm flex items-center justify-center z-50 p-4">
          <div className="cyber-glass rounded-2xl p-6 border border-cyber-primary/30 w-full max-w-md shadow-glass animate-in fade-in zoom-in-95 duration-150">
            <div className="flex justify-between items-center border-b border-cyber-border/30 pb-3 mb-4">
              <h3 className="font-extrabold text-sm font-mono text-cyber-primary flex items-center gap-2">
                <FolderPlus className="w-5 h-5" /> CREATE NEW DIRECTORY
              </h3>
              <button 
                onClick={() => setShowCreateModal(false)} 
                className="p-1 bg-cyber-bg border border-cyber-border rounded-lg hover:border-cyber-danger text-cyber-muted hover:text-cyber-danger transition-colors"
              >
                <X className="w-4 h-4" />
              </button>
            </div>
            
            <form onSubmit={handleCreateProject} className="space-y-4">
              <div className="flex flex-col gap-1.5">
                <label className="text-xs font-bold text-cyber-muted font-mono uppercase">Folder Name</label>
                <input
                  type="text"
                  placeholder="e.g., LLM Agent Experiment"
                  value={projectName}
                  onChange={(e) => setProjectName(e.target.value)}
                  className="w-full bg-cyber-bg border border-cyber-border rounded-xl px-3 py-2 text-sm text-cyber-text focus:outline-none focus:border-cyber-primary/50"
                  required
                />
              </div>

              <div className="flex flex-col gap-1.5">
                <label className="text-xs font-bold text-cyber-muted font-mono uppercase">Description</label>
                <textarea
                  placeholder="Provide context about research topic..."
                  value={projectDesc}
                  onChange={(e) => setProjectDesc(e.target.value)}
                  rows={3}
                  className="w-full bg-cyber-bg border border-cyber-border rounded-xl px-3 py-2 text-sm text-cyber-text focus:outline-none focus:border-cyber-primary/50"
                />
              </div>

              <div className="flex gap-3 justify-end pt-2">
                <button
                  type="button"
                  onClick={() => setShowCreateModal(false)}
                  className="px-4 py-2 border border-cyber-border rounded-xl text-xs font-bold text-cyber-muted hover:text-cyber-text"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="px-5 py-2 bg-cyber-primary text-white rounded-xl text-xs font-bold"
                >
                  Create Folder
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Main Split Grid: Projects Explorer (Select project or view list) */}
      <div className="grid grid-cols-3 gap-8 flex-1 min-h-0">
        
        {/* Left column: Grid of Directories */}
        <div className="col-span-1 flex flex-col gap-4 overflow-y-auto pr-2">
          <h3 className="font-extrabold text-xs font-mono tracking-widest text-cyber-muted uppercase">
            ACTIVE DIRECTORIES ({projects.length})
          </h3>

          {projects.length > 0 ? (
            <div className="flex flex-col gap-3">
              {projects.map((p) => {
                const isActive = selectedProjectId === p.id;
                return (
                  <div
                    key={p.id}
                    onClick={() => {
                      setSelectedProjectId(p.id);
                      setEditName(p.name);
                      setEditDesc(p.description);
                      setIsEditingProject(false);
                    }}
                    className={`cyber-glass rounded-xl p-4 border cursor-pointer transition-all flex items-center justify-between group ${
                      isActive 
                        ? 'border-cyber-primary bg-cyber-primary/5 shadow-glow-primary' 
                        : 'border-cyber-border/40 hover:border-cyber-primary/20'
                    }`}
                  >
                    <div className="flex items-center gap-3 min-w-0">
                      {isActive ? (
                        <FolderOpen className="w-5 h-5 text-cyber-primary shrink-0" />
                      ) : (
                        <Folder className="w-5 h-5 text-cyber-primary shrink-0" />
                      )}
                      
                      <div className="min-w-0">
                        <h4 className={`text-sm font-bold truncate ${isActive ? 'text-cyber-primary' : 'text-cyber-text'}`}>
                          {p.name}
                        </h4>
                        <p className="text-[11px] text-cyber-muted truncate max-w-[200px] mt-0.5">
                          {p.description || 'No description provided'}
                        </p>
                      </div>
                    </div>
                    <ChevronRight className={`w-4 h-4 text-cyber-muted transition-transform ${isActive ? 'translate-x-1 text-cyber-primary' : 'group-hover:translate-x-0.5'}`} />
                  </div>
                );
              })}
            </div>
          ) : (
            <div className="border border-dashed border-cyber-border/60 rounded-xl p-8 text-center flex flex-col items-center justify-center bg-cyber-card/10">
              <Folder className="w-8 h-8 text-cyber-muted/30 mb-2" />
              <p className="text-xs font-bold text-cyber-text">No Projects Mapped</p>
              <p className="text-[10px] text-cyber-muted/70 max-w-[150px] mt-0.5">Create your first folder directory above.</p>
            </div>
          )}
        </div>

        {/* Right column: Detailed Project Explorer */}
        <div className="col-span-2 flex flex-col min-h-0 bg-cyber-card/10 border border-cyber-border/40 rounded-2xl p-6 overflow-hidden">
          {selectedProjectId && activeProject ? (
            <div className="flex-1 flex flex-col min-h-0 gap-6">
              
              {/* Explorer Header */}
              <div className="flex items-start justify-between border-b border-cyber-border/30 pb-4">
                <div className="flex-1 min-w-0">
                  {isEditingProject ? (
                    <div className="space-y-3 max-w-lg">
                      <input
                        type="text"
                        value={editName}
                        onChange={(e) => setEditName(e.target.value)}
                        className="w-full bg-cyber-bg border border-cyber-border rounded-xl px-3 py-1.5 text-sm text-cyber-text font-bold focus:outline-none"
                      />
                      <textarea
                        value={editDesc}
                        onChange={(e) => setEditDesc(e.target.value)}
                        rows={2}
                        className="w-full bg-cyber-bg border border-cyber-border rounded-xl px-3 py-1.5 text-xs text-cyber-muted focus:outline-none"
                      />
                      <div className="flex gap-2 justify-end">
                        <button
                          onClick={() => setIsEditingProject(false)}
                          className="px-3 py-1 border border-cyber-border rounded-lg text-xs"
                        >
                          Cancel
                        </button>
                        <button
                          onClick={handleSaveEdit}
                          className="px-3 py-1 bg-cyber-accent text-white rounded-lg text-xs font-bold"
                        >
                          Save
                        </button>
                      </div>
                    </div>
                  ) : (
                    <div className="flex flex-col gap-1">
                      <h2 className="text-lg font-extrabold text-cyber-text flex items-center gap-2">
                        <Briefcase className="w-5 h-5 text-cyber-primary" /> {activeProject.name}
                      </h2>
                      <p className="text-xs text-cyber-muted">
                        {activeProject.description || 'No folder description.'}
                      </p>
                      <span className="text-[10px] text-cyber-muted font-mono mt-1">
                        CREATED ON: {new Date(activeProject.createdAt).toLocaleDateString()}
                      </span>
                    </div>
                  )}
                </div>

                {!isEditingProject && (
                  <div className="flex items-center gap-2 shrink-0 ml-4">
                    <button
                      onClick={() => setIsEditingProject(true)}
                      className="p-2 bg-cyber-bg border border-cyber-border/70 hover:border-cyber-primary/40 rounded-xl text-cyber-muted hover:text-cyber-primary transition-all"
                      title="Edit project meta"
                    >
                      <Edit3 className="w-4 h-4" />
                    </button>
                    <button
                      onClick={handleDelete}
                      className="p-2 bg-cyber-bg border border-cyber-border/70 hover:border-cyber-danger/40 rounded-xl text-cyber-muted hover:text-cyber-danger transition-all"
                      title="Delete folder (Safely unassigns chats)"
                    >
                      <Trash2 className="w-4 h-4" />
                    </button>
                  </div>
                )}
              </div>

              {/* Project Explorer Main Canvas split: Current chats vs add chats */}
              <div className="flex-1 grid grid-cols-2 gap-6 min-h-0">
                
                {/* Column 1: Conversations assigned to project */}
                <div className="flex flex-col gap-3 min-h-0">
                  <h4 className="font-extrabold text-xs font-mono tracking-widest text-cyber-muted uppercase flex items-center gap-1.5">
                    <FileText className="w-3.5 h-3.5 text-cyber-primary" /> Folder Conversations ({projectConversations.length})
                  </h4>

                  <div className="flex-1 overflow-y-auto space-y-3 pr-2">
                    {projectConversations.length > 0 ? (
                      projectConversations.map((c) => (
                        <div key={c.id} className="cyber-glass rounded-xl p-3 border border-cyber-border/40 hover:border-cyber-primary/20 transition-all flex items-center justify-between bg-cyber-card/15 group">
                          <div className="min-w-0 pr-2">
                            <h5 className="text-xs font-bold text-cyber-text truncate pr-1">{c.title}</h5>
                            <span className="uppercase text-[9px] font-mono text-cyber-primary bg-cyber-primary/5 px-1.5 py-0.5 rounded border border-cyber-primary/10 mt-1 inline-block">
                              {c.platform}
                            </span>
                          </div>
                          
                          <button
                            onClick={() => handleAssignChat(c.id, null)}
                            className="p-1 rounded bg-cyber-bg border border-cyber-border text-cyber-danger hover:border-cyber-danger/30"
                            title="Remove from Folder"
                          >
                            <X className="w-3.5 h-3.5" />
                          </button>
                        </div>
                      ))
                    ) : (
                      <div className="h-full border border-dashed border-cyber-border/60 rounded-xl p-6 text-center flex flex-col items-center justify-center bg-cyber-bg/20">
                        <Info className="w-6 h-6 text-cyber-muted/30 mb-1" />
                        <p className="text-xs text-cyber-muted font-bold">Empty Directory</p>
                        <p className="text-[10px] text-cyber-muted/70 max-w-[130px] mt-0.5">Use the right column to assign unassigned chats.</p>
                      </div>
                    )}
                  </div>
                </div>

                {/* Column 2: Unassigned Conversations (Available to add) */}
                <div className="flex flex-col gap-3 min-h-0 border-l border-cyber-border/30 pl-6">
                  <h4 className="font-extrabold text-xs font-mono tracking-widest text-cyber-muted uppercase flex items-center gap-1.5">
                    <Plus className="w-3.5 h-3.5 text-cyber-accent" /> Available Contexts ({unassignedConvos.length})
                  </h4>

                  <div className="flex-1 overflow-y-auto space-y-3 pr-2">
                    {unassignedConvos.length > 0 ? (
                      unassignedConvos.map((c) => (
                        <div key={c.id} className="cyber-glass rounded-xl p-3 border border-cyber-border/40 hover:border-cyber-accent/20 transition-all flex items-center justify-between bg-cyber-card/15 group">
                          <div className="min-w-0 pr-2">
                            <h5 className="text-xs font-bold text-cyber-text truncate pr-1">{c.title}</h5>
                            <span className="uppercase text-[9px] font-mono text-cyber-accent bg-cyber-accent/5 px-1.5 py-0.5 rounded border border-cyber-accent/10 mt-1 inline-block">
                              {c.platform}
                            </span>
                          </div>
                          
                          <button
                            onClick={() => handleAssignChat(c.id, activeProject.id)}
                            className="p-1 rounded bg-cyber-bg border border-cyber-border text-cyber-accent hover:border-cyber-accent/30"
                            title="Assign to Folder"
                          >
                            <Plus className="w-3.5 h-3.5" />
                          </button>
                        </div>
                      ))
                    ) : (
                      <div className="h-full border border-dashed border-cyber-border/60 rounded-xl p-6 text-center flex flex-col items-center justify-center bg-cyber-bg/20">
                        <Check className="w-6 h-6 text-cyber-accent/30 mb-1" />
                        <p className="text-xs text-cyber-muted font-bold">All Chats Assigned</p>
                        <p className="text-[10px] text-cyber-muted/70 max-w-[130px] mt-0.5">There are no unassigned chats in your database.</p>
                      </div>
                    )}
                  </div>
                </div>

              </div>

            </div>
          ) : (
            <div className="flex-1 flex flex-col items-center justify-center text-center p-10">
              <FolderOpen className="w-12 h-12 text-cyber-muted/20 mb-3 animate-bounce" />
              <h3 className="text-sm font-bold text-cyber-text">Explorer Directory Unselected</h3>
              <p className="text-xs text-cyber-muted max-w-sm mt-1">
                Pick a folder from the active directories list on the left to explore conversations, rename files, or associate chats with project scopes.
              </p>
            </div>
          )}
        </div>

      </div>

    </div>
  );
}
