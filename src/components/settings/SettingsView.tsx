import { useState, useEffect } from 'react';
import { db, migrateDatabaseEncryption } from '../../services/db';
import { generateMasterKey, exportKeyToJWK, importKeyFromJWK } from '../../services/crypto';
import { 
  Sun, 
  Moon, 
  Download, 
  Upload, 
  Trash2, 
  Key, 
  Lock, 
  Unlock, 
  AlertTriangle,
  Info
} from 'lucide-react';

interface SettingsViewProps {
  isPopup: boolean;
  onThemeChange: (theme: 'dark' | 'light') => void;
}

export default function SettingsView({ isPopup, onThemeChange }: SettingsViewProps) {
  // Option States
  const [theme, setTheme] = useState<'dark' | 'light'>('dark');
  const [autoSave, setAutoSave] = useState(true);
  const [encryptionEnabled, setEncryptionEnabled] = useState(false);
  const [masterKeyJwk, setMasterKeyJwk] = useState<JsonWebKey | null>(null);

  // UI helper states
  const [copiedKey, setCopiedKey] = useState(false);
  const [keyToImport, setKeyToImport] = useState('');
  const [showKeyConsole, setShowKeyConsole] = useState(false);
  const [isMigrating, setIsMigrating] = useState(false);
  const [errorMessage, setErrorMessage] = useState('');

  // --- Load Settings on Mount ---
  useEffect(() => {
    if (typeof chrome !== 'undefined' && chrome.storage && chrome.storage.local) {
      chrome.storage.local.get({
        theme: 'dark',
        autoSave: true,
        encryptionEnabled: false,
        masterKeyJwk: null
      }, (res) => {
        setTheme(res.theme);
        setAutoSave(res.autoSave);
        setEncryptionEnabled(res.encryptionEnabled);
        setMasterKeyJwk(res.masterKeyJwk);
      });
    } else {
      // Fallback
      setTheme((localStorage.getItem('theme') as 'dark' | 'light') || 'dark');
      setAutoSave(localStorage.getItem('autoSave') !== 'false');
      setEncryptionEnabled(localStorage.getItem('encryptionEnabled') === 'true');
      setMasterKeyJwk(JSON.parse(localStorage.getItem('masterKeyJwk') || 'null'));
    }
  }, []);

  // --- Settings Writers ---

  const updateSetting = (key: string, value: any) => {
    if (typeof chrome !== 'undefined' && chrome.storage && chrome.storage.local) {
      chrome.storage.local.set({ [key]: value });
    } else {
      localStorage.setItem(key, typeof value === 'object' ? JSON.stringify(value) : String(value));
    }
  };

  const handleToggleTheme = () => {
    const nextTheme = theme === 'dark' ? 'light' : 'dark';
    setTheme(nextTheme);
    updateSetting('theme', nextTheme);
    onThemeChange(nextTheme);
  };

  const handleToggleAutoSave = () => {
    const nextSave = !autoSave;
    setAutoSave(nextSave);
    updateSetting('autoSave', nextSave);
  };

  // --- Web Crypto Encryption Toggle Action ---
  const handleToggleEncryption = async () => {
    setIsMigrating(true);
    setErrorMessage('');
    
    try {
      if (!encryptionEnabled) {
        // Turning Encryption ON
        let key = null;
        let jwk = null;
        
        // Generate new key if none exists
        if (!masterKeyJwk) {
          key = await generateMasterKey();
          jwk = await exportKeyToJWK(key);
        } else {
          jwk = masterKeyJwk;
          key = await importKeyFromJWK(jwk);
        }

        // Migrate all existing plaintext IndexedDB entries
        await migrateDatabaseEncryption(true, key);

        setEncryptionEnabled(true);
        setMasterKeyJwk(jwk);
        updateSetting('encryptionEnabled', true);
        updateSetting('masterKeyJwk', jwk);
      } else {
        // Turning Encryption OFF
        if (confirm('Decrypting your database will expose titles and messages in plain text inside local IndexedDB storage. Continue?')) {
          // Decrypt existing encrypted IndexedDB entries into plaintext
          await migrateDatabaseEncryption(false, null);

          setEncryptionEnabled(false);
          updateSetting('encryptionEnabled', false);
          // We keep the masterKeyJwk cache in storage so they can reuse it if toggled back on, but mark active off
        }
      }
    } catch (err) {
      console.error(err);
      setErrorMessage('Security migration failed: ' + String(err));
    } finally {
      setIsMigrating(false);
    }
  };

  // --- Key Import Recovery Helper ---
  const handleImportKey = async () => {
    if (!keyToImport.trim()) return;
    setErrorMessage('');
    
    try {
      const parsedJwk = JSON.parse(keyToImport.trim());
      // Test import validity
      const key = await importKeyFromJWK(parsedJwk);
      
      setMasterKeyJwk(parsedJwk);
      updateSetting('masterKeyJwk', parsedJwk);
      
      // If encryption is already on, run database re-encryption migration
      if (encryptionEnabled) {
        setIsMigrating(true);
        await migrateDatabaseEncryption(true, key);
        setIsMigrating(false);
      }

      setKeyToImport('');
      alert('Master encryption key imported and integrated successfully!');
    } catch (err) {
      console.error(err);
      setErrorMessage('Invalid JWK Key format: ' + String(err));
    }
  };

  const handleCopyKey = () => {
    if (!masterKeyJwk) return;
    navigator.clipboard.writeText(JSON.stringify(masterKeyJwk));
    setCopiedKey(true);
    setTimeout(() => setCopiedKey(false), 2000);
  };

  // --- Backup Database Archive ---
  const handleExportDBBackup = async () => {
    const backup: any = {
      projects: await db.projects.toArray(),
      conversations: await db.conversations.toArray(),
      messages: await db.messages.toArray(),
      archivedAt: new Date().toISOString(),
      version: 1
    };

    const text = JSON.stringify(backup, null, 2);
    const blob = new Blob([text], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    
    const a = document.createElement('a');
    a.href = url;
    a.download = `ai_context_bridge_backup_${Date.now()}.json`;
    a.click();
    URL.revokeObjectURL(url);
  };

  // --- Restore Database Archive ---
  const handleImportDBBackup = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = async (event) => {
      try {
        const parsed = JSON.parse(event.target?.result as string);
        if (!parsed.projects || !parsed.conversations || !parsed.messages) {
          throw new Error('Invalid backup schema definition.');
        }

        if (confirm('Restoring this backup will merge data into your active workspace. Duplicate IDs will be overwritten. Proceed?')) {
          setIsMigrating(true);
          
          await db.transaction('rw', [db.projects, db.conversations, db.messages], async () => {
            // Restore projects
            for (const p of parsed.projects) {
              await db.projects.put(p);
            }
            // Restore conversations
            for (const c of parsed.conversations) {
              await db.conversations.put(c);
            }
            // Restore messages
            for (const m of parsed.messages) {
              await db.messages.put(m);
            }
          });

          alert('Database restored successfully!');
        }
      } catch (err) {
        alert('Failed to parse backup: ' + String(err));
      } finally {
        setIsMigrating(false);
        e.target.value = ''; // Reset input
      }
    };
    reader.readAsText(file);
  };

  // --- Wipe entire Database ---
  const handleResetDatabase = async () => {
    if (!confirm('🚨 CRITICAL ACTION: Wipe all folders, conversations, and captured history permanently? This is unrecoverable.')) return;
    
    setIsMigrating(true);
    try {
      await db.transaction('rw', [db.projects, db.conversations, db.messages], async () => {
        await db.projects.clear();
        await db.conversations.clear();
        await db.messages.clear();
      });
      
      // Wipe storage settings
      if (typeof chrome !== 'undefined' && chrome.storage && chrome.storage.local) {
        chrome.storage.local.clear(() => {
          chrome.storage.local.set({
            theme: 'dark',
            autoSave: true,
            encryptionEnabled: false,
            masterKeyJwk: null
          });
        });
      } else {
        localStorage.clear();
      }
      
      alert('AI Context Bridge reset successfully.');
      window.location.reload();
    } catch (e) {
      console.error(e);
    } finally {
      setIsMigrating(false);
    }
  };

  // --- COMPACT POPUP LAYOUT ---
  if (isPopup) {
    return (
      <div className="h-full flex flex-col gap-3.5 font-sans text-cyber-text">
        <h3 className="text-[10px] font-bold tracking-widest font-mono text-cyber-muted uppercase">SYSTEM PREFERENCES</h3>

        <div className="cyber-glass rounded-xl p-3 border border-cyber-border/40 space-y-3.5">
          {/* Theme Mode toggle */}
          <div className="flex items-center justify-between">
            <span className="text-xs font-semibold">Workspace Theme</span>
            <button 
              onClick={handleToggleTheme}
              className="p-1.5 rounded bg-cyber-bg border border-cyber-border hover:border-cyber-primary/45 transition-colors text-cyber-primary"
            >
              {theme === 'dark' ? <Moon className="w-4 h-4" /> : <Sun className="w-4 h-4" />}
            </button>
          </div>

          {/* Auto-save Toggle */}
          <div className="flex items-center justify-between">
            <span className="text-xs font-semibold">Auto-Save Captures</span>
            <button 
              onClick={handleToggleAutoSave}
              className={`px-3 py-1 rounded text-[10px] font-extrabold border transition-all ${
                autoSave 
                  ? 'bg-cyber-accent/10 border-cyber-accent/30 text-cyber-accent' 
                  : 'bg-cyber-card border-cyber-border text-cyber-muted'
              }`}
            >
              {autoSave ? 'ON' : 'OFF'}
            </button>
          </div>

          {/* Local Encryption Toggle */}
          <div className="flex items-center justify-between border-t border-cyber-border/20 pt-3">
            <div className="flex flex-col gap-0.5">
              <span className="text-xs font-semibold flex items-center gap-1">
                {encryptionEnabled ? <Lock className="w-3 h-3 text-cyber-accent" /> : <Unlock className="w-3 h-3 text-cyber-warning" />}
                Local Encryption
              </span>
              <span className="text-[8px] text-cyber-muted font-mono leading-none">AES-GCM SECURED</span>
            </div>
            <button 
              onClick={handleToggleEncryption}
              disabled={isMigrating}
              className={`px-3 py-1 rounded text-[10px] font-extrabold border transition-all ${
                encryptionEnabled 
                  ? 'bg-cyber-accent/10 border-cyber-accent/35 text-cyber-accent' 
                  : 'bg-cyber-card border-cyber-border text-cyber-warning'
              }`}
            >
              {isMigrating ? 'MIGRATING...' : encryptionEnabled ? 'ENABLED' : 'DISABLED'}
            </button>
          </div>
        </div>

        {/* Diagnostic info */}
        <div className="flex-1 flex flex-col justify-end">
          <div className="bg-cyber-card/60 border border-cyber-border/30 rounded-xl p-2.5 flex items-center gap-2 font-mono text-[9px] text-cyber-muted">
            <Info className="w-3.5 h-3.5 text-cyber-primary shrink-0 animate-pulse" />
            <span>Open full Workspace tab to access database backup tools.</span>
          </div>
        </div>
      </div>
    );
  }

  // --- FULL INTERACTIVE DASHBOARD SETTINGS VIEW ---
  return (
    <div className="max-w-3xl flex flex-col gap-6">
      
      {isMigrating && (
        <div className="fixed inset-0 bg-cyber-bg/70 backdrop-blur-md flex flex-col items-center justify-center z-50">
          <div className="p-2 bg-cyber-primary/20 border border-cyber-primary/30 rounded-full animate-ping" />
          <h3 className="font-extrabold text-sm font-mono text-cyber-primary mt-4 tracking-widest">TRANSACTION IN PROGRESS</h3>
          <p className="text-xs text-cyber-muted mt-1.5">Migrating database entries. Please do not close this extension panel...</p>
        </div>
      )}

      {errorMessage && (
        <div className="p-4 bg-cyber-danger/10 border border-cyber-danger/30 rounded-2xl flex items-center gap-3 text-cyber-danger text-xs font-semibold">
          <AlertTriangle className="w-5 h-5 shrink-0" />
          <span>{errorMessage}</span>
        </div>
      )}

      {/* Grid of Preferences Panels */}
      <div className="grid grid-cols-2 gap-6">
        
        {/* Card 1: Core System options */}
        <div className="cyber-glass rounded-2xl p-5 border border-cyber-border/40 flex flex-col gap-5 bg-cyber-card/15 shadow-sm">
          <h3 className="font-extrabold text-xs font-mono tracking-widest text-cyber-muted uppercase border-b border-cyber-border/30 pb-2">
            PREFERENCES CONFIG
          </h3>

          {/* Theme Selector */}
          <div className="flex items-center justify-between">
            <div className="flex flex-col gap-0.5">
              <span className="text-sm font-bold text-cyber-text">Dashboard Theme</span>
              <span className="text-xs text-cyber-muted">Toggle between Dark and Light workspaces</span>
            </div>
            <button
              onClick={handleToggleTheme}
              className="flex items-center gap-2 px-3 py-1.5 bg-cyber-bg border border-cyber-border rounded-xl text-xs font-semibold text-cyber-text hover:border-cyber-primary/45 transition-all"
            >
              {theme === 'dark' ? (
                <>
                  <Moon className="w-4 h-4 text-cyber-primary" />
                  <span>Futuristic Dark</span>
                </>
              ) : (
                <>
                  <Sun className="w-4 h-4 text-cyber-warning" />
                  <span>Sleek Light</span>
                </>
              )}
            </button>
          </div>

          {/* Auto-Save toggle */}
          <div className="flex items-center justify-between">
            <div className="flex flex-col gap-0.5">
              <span className="text-sm font-bold text-cyber-text">Real-time Auto-Save</span>
              <span className="text-xs text-cyber-muted">Write mutations immediately to local IndexedDB</span>
            </div>
            <button
              onClick={handleToggleAutoSave}
              className={`px-4 py-1.5 rounded-xl text-xs font-bold border transition-all ${
                autoSave 
                  ? 'bg-cyber-accent/10 border-cyber-accent/35 text-cyber-accent' 
                  : 'bg-cyber-bg border-cyber-border text-cyber-muted hover:text-cyber-text'
              }`}
            >
              {autoSave ? 'Auto-Save ON' : 'Auto-Save OFF'}
            </button>
          </div>
        </div>

        {/* Card 2: Security & Local Cryptography */}
        <div className="cyber-glass rounded-2xl p-5 border border-cyber-border/40 flex flex-col gap-4 bg-cyber-card/15 shadow-sm">
          <h3 className="font-extrabold text-xs font-mono tracking-widest text-cyber-muted uppercase border-b border-cyber-border/30 pb-2">
            LOCAL ENCRYPTION CONSOLE
          </h3>

          <div className="flex items-center justify-between">
            <div className="flex flex-col gap-0.5">
              <span className="text-sm font-bold text-cyber-text flex items-center gap-1.5">
                {encryptionEnabled ? <Lock className="w-4 h-4 text-cyber-accent" /> : <Unlock className="w-4 h-4 text-cyber-warning" />}
                Database Encryption
              </span>
              <span className="text-xs text-cyber-muted">Cipher stored records with Web Crypto AES-GCM</span>
            </div>
            
            <button
              onClick={handleToggleEncryption}
              disabled={isMigrating}
              className={`px-4 py-1.5 rounded-xl text-xs font-bold border transition-all ${
                encryptionEnabled 
                  ? 'bg-cyber-accent/15 border-cyber-accent/40 text-cyber-accent hover:border-cyber-warning/40 hover:text-cyber-warning' 
                  : 'bg-cyber-bg border-cyber-warning/40 text-cyber-warning hover:bg-cyber-warning/10'
              }`}
            >
              {encryptionEnabled ? 'Disable Encryption' : 'Enable Encryption'}
            </button>
          </div>

          <p className="text-[11px] text-cyber-muted leading-relaxed">
            All conversations and message blocks are ciphered inside IndexedDB when active. Toggling states triggers background migrations without loss.
          </p>

          {/* Sub Key Console Toggle */}
          {encryptionEnabled && masterKeyJwk && (
            <div className="border-t border-cyber-border/30 pt-3 flex flex-col gap-2">
              <button
                onClick={() => setShowKeyConsole(!showKeyConsole)}
                className="text-xs text-cyber-primary hover:text-cyber-secondary flex items-center gap-1 font-bold font-mono transition-colors"
              >
                <Key className="w-3.5 h-3.5" />
                <span>{showKeyConsole ? 'Hide Cryptographic Keys' : 'Inspect Encryption Key'}</span>
              </button>

              {showKeyConsole && (
                <div className="space-y-3 mt-1 font-mono text-[10px]">
                  <div className="flex flex-col gap-1">
                    <span className="text-cyber-muted font-bold">JWK Cryptographic Envelope:</span>
                    <div className="flex gap-2">
                      <input
                        type="password"
                        value={JSON.stringify(masterKeyJwk)}
                        readOnly
                        className="flex-1 bg-cyber-bg border border-cyber-border rounded px-2.5 py-1 text-cyber-text"
                      />
                      <button
                        onClick={handleCopyKey}
                        className="px-2.5 py-1 bg-cyber-bg border border-cyber-border hover:border-cyber-primary/45 rounded text-cyber-primary transition-all font-bold"
                      >
                        {copiedKey ? 'COPIED!' : 'COPY KEY'}
                      </button>
                    </div>
                  </div>

                  {/* Key import field */}
                  <div className="flex flex-col gap-1 border-t border-cyber-border/20 pt-2.5">
                    <span className="text-cyber-muted font-bold">Recover / Import Custom Key:</span>
                    <div className="flex gap-2">
                      <input
                        type="text"
                        placeholder="Paste JWK backup string here..."
                        value={keyToImport}
                        onChange={(e) => setKeyToImport(e.target.value)}
                        className="flex-1 bg-cyber-bg border border-cyber-border rounded px-2.5 py-1 text-cyber-text focus:outline-none"
                      />
                      <button
                        onClick={handleImportKey}
                        className="px-2.5 py-1 bg-cyber-accent/15 border border-cyber-accent/30 hover:border-cyber-accent text-cyber-accent rounded font-bold transition-all"
                      >
                        IMPORT
                      </button>
                    </div>
                  </div>
                </div>
              )}
            </div>
          )}
        </div>

      </div>

      {/* Card 3: Database Portability Backup & Danger Zone */}
      <div className="cyber-glass rounded-2xl p-5 border border-cyber-border/40 flex flex-col gap-5 bg-cyber-card/15 shadow-sm">
        <h3 className="font-extrabold text-xs font-mono tracking-widest text-cyber-muted uppercase border-b border-cyber-border/30 pb-2">
          DATA PORTABILITY & BACKUP
        </h3>

        <div className="grid grid-cols-2 gap-8 items-start">
          {/* Backup columns */}
          <div className="flex flex-col gap-4">
            <h4 className="text-xs font-bold text-cyber-text flex items-center gap-1.5 uppercase font-mono">
              <Download className="w-4 h-4 text-cyber-primary" /> Download & Restore Archives
            </h4>
            
            <p className="text-xs text-cyber-muted leading-relaxed">
              Generate a full backup containing your folders, mapped configurations, and message history as a single file. You can restore this archive on other browsers anytime.
            </p>

            <div className="flex items-center gap-3">
              <button
                onClick={handleExportDBBackup}
                className="flex items-center gap-1.5 px-4 py-2 bg-cyber-primary text-white rounded-xl text-xs font-bold shadow-md shadow-cyber-primary/20 hover:bg-blue-600 transition-all border border-cyber-primary/20"
              >
                <Download className="w-3.5 h-3.5" />
                <span>Export Full Backup</span>
              </button>

              <label className="flex items-center gap-1.5 px-4 py-2 bg-cyber-bg border border-cyber-border/70 hover:border-cyber-primary/45 text-cyber-text rounded-xl text-xs font-bold cursor-pointer transition-all">
                <Upload className="w-3.5 h-3.5" />
                <span>Import Backup</span>
                <input
                  type="file"
                  accept=".json"
                  onChange={handleImportDBBackup}
                  className="hidden"
                />
              </label>
            </div>
          </div>

          {/* Danger zone column */}
          <div className="flex flex-col gap-4 border-l border-cyber-border/20 pl-8">
            <h4 className="text-xs font-bold text-cyber-danger flex items-center gap-1.5 uppercase font-mono">
              <AlertTriangle className="w-4 h-4 text-cyber-danger animate-pulse" /> Danger Zone
            </h4>

            <p className="text-xs text-cyber-muted leading-relaxed">
              Erase all database structures. All saved folders, conversations, messages, settings, and encryption keys will be instantly and permanently deleted from this machine.
            </p>

            <div>
              <button
                onClick={handleResetDatabase}
                className="flex items-center gap-1.5 px-4 py-2 bg-cyber-danger/10 border border-cyber-danger/30 hover:bg-cyber-danger hover:text-white rounded-xl text-xs font-bold transition-all text-cyber-danger"
              >
                <Trash2 className="w-3.5 h-3.5" />
                <span>Erase All Database Records</span>
              </button>
            </div>
          </div>
        </div>

      </div>

    </div>
  );
}
