import { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { 
  LayoutDashboard, 
  FolderKanban, 
  FileText, 
  Settings as SettingsIcon, 
  Layers, 
  ExternalLink,
  Shield,
  Activity
} from 'lucide-react';

// Import Views
import DashboardView from './components/dashboard/DashboardView';
import ProjectsView from './components/projects/ProjectsView';
import SavedContextsView from './components/saved-contexts/SavedContextsView';
import SettingsView from './components/settings/SettingsView';

export default function App() {
  const [currentView, setCurrentView] = useState<'dashboard' | 'projects' | 'contexts' | 'settings'>('dashboard');
  const [isPopup, setIsPopup] = useState(false);
  const [theme, setTheme] = useState<'dark' | 'light'>('dark');

  // Detect extension viewport bounds
  useEffect(() => {
    const checkViewport = () => {
      const popupMode = window.location.pathname.includes('popup.html') || window.innerWidth < 500;
      setIsPopup(popupMode);
    };
    
    checkViewport();
    window.addEventListener('resize', checkViewport);
    return () => window.removeEventListener('resize', checkViewport);
  }, []);

  // Theme Sync Layer
  useEffect(() => {
    // Read theme from storage
    if (typeof chrome !== 'undefined' && chrome.storage && chrome.storage.local) {
      chrome.storage.local.get({ theme: 'dark' }, (res) => {
        setTheme(res.theme);
      });
    } else {
      const savedTheme = localStorage.getItem('theme') as 'dark' | 'light' | null;
      if (savedTheme) setTheme(savedTheme);
    }
  }, []);

  useEffect(() => {
    const root = document.documentElement;
    if (theme === 'dark') {
      root.classList.add('dark');
      root.style.backgroundColor = '#030712';
    } else {
      root.classList.remove('dark');
      root.style.backgroundColor = '#f9fafb';
    }
  }, [theme]);

  // Sidebar Menu Items for Dashboard Tab
  const menuItems = [
    { id: 'dashboard', label: 'Dashboard', icon: LayoutDashboard },
    { id: 'projects', label: 'Projects', icon: FolderKanban },
    { id: 'contexts', label: 'Saved Contexts', icon: FileText },
    { id: 'settings', label: 'Settings', icon: SettingsIcon },
  ] as const;

  // View Renderer Switcher
  const renderView = () => {
    switch (currentView) {
      case 'dashboard':
        return <DashboardView isPopup={isPopup} setView={setCurrentView} />;
      case 'projects':
        return <ProjectsView isPopup={isPopup} />;
      case 'contexts':
        return <SavedContextsView isPopup={isPopup} />;
      case 'settings':
        return <SettingsView isPopup={isPopup} onThemeChange={setTheme} />;
    }
  };

  // --- Render Popup Window Layout (Compact Viewport) ---
  if (isPopup) {
    return (
      <div className="w-[380px] h-[550px] flex flex-col bg-cyber-bg text-cyber-text overflow-hidden font-sans border border-cyber-border/40 select-none">
        {/* Compact Header */}
        <header className="flex items-center justify-between px-4 py-3 bg-cyber-card/80 border-b border-cyber-border/30 backdrop-blur-md">
          <div className="flex items-center gap-2">
            <div className="relative">
              <Layers className="w-5 h-5 text-cyber-primary animate-pulse" />
              <div className="absolute -top-0.5 -right-0.5 w-2 h-2 rounded-full bg-cyber-accent shadow-[0_0_8px_#10b981]" />
            </div>
            <div>
              <h1 className="text-sm font-bold tracking-wider bg-gradient-to-r from-cyber-primary to-cyber-secondary bg-clip-text text-transparent">
                CONTEXT BRIDGE
              </h1>
              <p className="text-[9px] text-cyber-muted font-mono leading-none">v1.0.0 (OFFLINE)</p>
            </div>
          </div>
          
          <button 
            onClick={() => window.open(chrome.runtime.getURL('dashboard.html'), '_blank')}
            className="flex items-center gap-1 text-[10px] text-cyber-primary hover:text-cyber-secondary px-2 py-1 bg-cyber-primary/5 rounded border border-cyber-primary/20 hover:border-cyber-secondary/30 transition-all font-medium"
            title="Open full interactive workspace dashboard"
          >
            <span>Workspace</span>
            <ExternalLink className="w-3 h-3" />
          </button>
        </header>

        {/* Dynamic Compact View Canvas */}
        <main className="flex-1 overflow-y-auto overflow-x-hidden p-3 min-h-0 relative bg-gradient-to-b from-cyber-bg via-cyber-bg to-cyber-card/30">
          <AnimatePresence mode="wait">
            <motion.div
              key={currentView}
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -10 }}
              transition={{ duration: 0.15 }}
              className="h-full"
            >
              {renderView()}
            </motion.div>
          </AnimatePresence>
        </main>

        {/* Compact Bottom Navigation */}
        <footer className="grid grid-cols-4 border-t border-cyber-border/30 bg-cyber-card/85 py-1 backdrop-blur-md z-10">
          {menuItems.map((item) => {
            const Icon = item.icon;
            const isActive = currentView === item.id;
            return (
              <button
                key={item.id}
                onClick={() => setCurrentView(item.id)}
                className={`flex flex-col items-center justify-center py-1 transition-all ${
                  isActive 
                    ? 'text-cyber-primary shadow-[inset_0_-2px_0_#3b82f6]' 
                    : 'text-cyber-muted hover:text-cyber-text'
                }`}
              >
                <Icon className={`w-4 h-4 ${isActive ? 'scale-110' : ''}`} />
                <span className="text-[9px] mt-0.5 font-medium">{item.label}</span>
              </button>
            );
          })}
        </footer>
      </div>
    );
  }

  // --- Render Full Tab Workspace Layout (Dashboard Mode) ---
  return (
    <div className="flex-1 min-h-screen flex bg-cyber-bg text-cyber-text font-sans">
      {/* Sidebar navigation panel */}
      <aside className="w-64 bg-cyber-card/75 border-r border-cyber-border/40 flex flex-col backdrop-blur-xl shrink-0">
        <div className="p-6 border-b border-cyber-border/30">
          <div className="flex items-center gap-3">
            <div className="relative">
              <div className="w-10 h-10 rounded-xl bg-gradient-to-tr from-cyber-primary via-blue-600 to-cyber-secondary p-[1px] shadow-glow-primary">
                <div className="w-full h-full rounded-xl bg-cyber-card flex items-center justify-center">
                  <Layers className="w-5 h-5 text-cyber-primary" />
                </div>
              </div>
              <span className="absolute bottom-0 right-0 w-2.5 h-2.5 rounded-full bg-cyber-accent border-2 border-cyber-card shadow-[0_0_8px_#10b981]" />
            </div>
            <div>
              <h1 className="font-extrabold text-sm tracking-wider bg-gradient-to-r from-cyber-primary via-indigo-400 to-cyber-secondary bg-clip-text text-transparent">
                CONTEXT BRIDGE
              </h1>
              <div className="flex items-center gap-1 font-mono text-[9px] text-cyber-muted">
                <Shield className="w-3 h-3 text-cyber-accent" />
                <span>LOCAL SECURE</span>
              </div>
            </div>
          </div>
        </div>

        {/* Sidebar Nav Buttons */}
        <nav className="flex-1 px-4 py-6 space-y-2">
          {menuItems.map((item) => {
            const Icon = item.icon;
            const isActive = currentView === item.id;
            return (
              <button
                key={item.id}
                onClick={() => setCurrentView(item.id)}
                className={`w-full flex items-center gap-3 px-4 py-3 rounded-lg text-sm font-semibold transition-all relative ${
                  isActive 
                    ? 'text-cyber-primary bg-cyber-primary/10 border border-cyber-primary/20 shadow-glow-primary' 
                    : 'text-cyber-muted hover:text-cyber-text hover:bg-white/5 border border-transparent'
                }`}
              >
                <Icon className={`w-4 h-4 ${isActive ? 'text-cyber-primary' : ''}`} />
                <span>{item.label}</span>
                {isActive && (
                  <motion.div 
                    layoutId="activeSideBarMarker" 
                    className="absolute right-3 w-1.5 h-1.5 rounded-full bg-cyber-primary"
                    transition={{ type: 'spring', stiffness: 300, damping: 30 }}
                  />
                )}
              </button>
            );
          })}
        </nav>

        {/* Sidebar bottom diagnostic feed */}
        <div className="p-4 m-4 rounded-xl bg-cyber-bg/50 border border-cyber-border/30 flex flex-col gap-2 font-mono text-[10px] text-cyber-muted">
          <div className="flex items-center justify-between border-b border-cyber-border/20 pb-1.5 font-bold">
            <span className="flex items-center gap-1">
              <Activity className="w-3 h-3 text-cyber-accent animate-pulse" /> SYSTEM LOGS
            </span>
            <span className="text-cyber-accent font-semibold">ONLINE</span>
          </div>
          <div className="flex justify-between">
            <span>IndexedDB Engine</span>
            <span className="text-cyber-text">DEXIE</span>
          </div>
          <div className="flex justify-between">
            <span>Web Crypto Core</span>
            <span className="text-cyber-text text-right font-sans">AES-256</span>
          </div>
          <div className="flex justify-between">
            <span>Token Estimator</span>
            <span className="text-cyber-text">BPE PROXY</span>
          </div>
        </div>
      </aside>

      {/* Main content body canvas */}
      <main className="flex-1 flex flex-col min-w-0 bg-gradient-to-b from-cyber-bg via-cyber-bg to-cyber-card/20 overflow-y-auto">
        <header className="h-16 border-b border-cyber-border/30 px-8 flex items-center justify-between shrink-0 bg-cyber-card/20 backdrop-blur-md sticky top-0 z-20">
          <div className="flex items-center gap-3">
            <h2 className="text-lg font-bold tracking-tight text-cyber-text">
              {menuItems.find(i => i.id === currentView)?.label}
            </h2>
            <div className="h-4 w-[1px] bg-cyber-border" />
            <span className="text-xs text-cyber-muted font-mono bg-cyber-card px-2.5 py-1 rounded border border-cyber-border/40 shadow-sm">
              PATH: /root/{currentView}
            </span>
          </div>
          <div className="flex items-center gap-4">
            <div className="flex items-center gap-2 px-3 py-1.5 rounded-full bg-cyber-accent/10 border border-cyber-accent/20 text-cyber-accent text-xs font-semibold">
              <span className="relative flex h-2 w-2">
                <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-cyber-accent opacity-75"></span>
                <span className="relative inline-flex rounded-full h-2 w-2 bg-cyber-accent"></span>
              </span>
              <span>DOM Capture Engine Hooked</span>
            </div>
          </div>
        </header>

        {/* View Canvas Wrapper */}
        <div className="flex-1 p-8 min-h-0 relative">
          <AnimatePresence mode="wait">
            <motion.div
              key={currentView}
              initial={{ opacity: 0, y: 15 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -15 }}
              transition={{ duration: 0.22, ease: 'easeOut' }}
              className="h-full"
            >
              {renderView()}
            </motion.div>
          </AnimatePresence>
        </div>
      </main>
    </div>
  );
}
