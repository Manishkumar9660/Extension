/**
 * ChatGPT Context Capture Content Script.
 * Runs in the context of chatgpt.com.
 * Offline-first real-time DOM monitoring and capture.
 */

// Simple local token estimator (mimicking src/services/token.ts without imports for flat bundle stability)
function estimateTokens(text: string): number {
  if (!text) return 0;
  const charCount = text.length;
  const wordCount = text.trim().split(/\s+/).length;
  const base = (charCount / 4.0 + wordCount / 0.75) / 2;
  const symbols = (text.match(/[{}[\]()<>`+\-*/=%;&|]/g) || []).length;
  return Math.max(1, Math.round(base + symbols * 0.4));
}

let activeConversationId: string | null = null;
let currentChatTitle = 'New ChatGPT Conversation';
let capturedMessageCount = 0;
let estimatedSessionTokens = 0;

// Floating HUD elements
let hudContainer: HTMLDivElement | null = null;
let tokenBadge: HTMLSpanElement | null = null;
let statusDot: HTMLSpanElement | null = null;
let syncBtn: HTMLButtonElement | null = null;

// --- DOM Scraper Logic ---

function getConversationId(): string | null {
  const match = window.location.pathname.match(/\/c\/([a-f0-9-]+)/i);
  return match ? match[1] : null;
}

function scrapeTitle(): string {
  // Capture ChatGPT updated page title
  let title = document.title;
  if (title) {
    title = title.replace(' - ChatGPT', '').replace('ChatGPT', '').trim();
    if (title && title !== 'New chat' && title !== 'New Chat') {
      return title;
    }
  }
  
  // Fallback: search for first user prompt in DOM
  const firstUserMsg = document.querySelector('[data-message-author-role="user"]');
  if (firstUserMsg && firstUserMsg.textContent) {
    const text = firstUserMsg.textContent.trim();
    return text.length > 30 ? text.slice(0, 30) + '...' : text;
  }

  return 'ChatGPT Conversation';
}

function scrapeMessages(): { role: 'user' | 'assistant'; content: string; timestamp: number }[] {
  const turns = document.querySelectorAll('[data-message-author-role]');
  const messages: { role: 'user' | 'assistant'; content: string; timestamp: number }[] = [];

  turns.forEach((turn, idx) => {
    const role = turn.getAttribute('data-message-author-role') as 'user' | 'assistant';
    if (role !== 'user' && role !== 'assistant') return;

    // Grab content container
    // User message text is usually direct, Assistant has markdown layout
    let text = '';
    if (role === 'assistant') {
      const markdownContainer = turn.querySelector('.markdown');
      text = markdownContainer ? (markdownContainer as HTMLElement).innerText : (turn as HTMLElement).innerText;
    } else {
      // Find the user text block
      const userTextContainer = turn.querySelector('.flex-col.max-w-full') || turn;
      text = (userTextContainer as HTMLElement).innerText || '';
    }

    // Strip out feedback buttons (Copy, regenerate, thumbs up, etc) from scraping text
    text = text
      .replace(/Copy code/g, '')
      .replace(/Copy/g, '')
      .replace(/🧠\s*Memory\s*updated/g, '')
      .trim();

    if (text) {
      messages.push({
        role,
        content: text,
        timestamp: Date.now() - (turns.length - idx) * 1000, // heuristic ordering fallback
      });
    }
  });

  return messages;
}

/**
 * Triggers capture and passes to background script.
 */
function captureAndSync(manual = false) {
  const convoId = getConversationId();
  if (!convoId) {
    // If no ID yet (new chat), we wait until ChatGPT assigns a UUID in URL
    updateHUDStatus('Waiting for chat ID...', 'warning');
    return;
  }

  activeConversationId = convoId;
  currentChatTitle = scrapeTitle();
  const messages = scrapeMessages();

  if (messages.length === 0) {
    updateHUDStatus('Empty Chat', 'warning');
    return;
  }

  capturedMessageCount = messages.length;
  
  // Calculate total tokens
  let tokensSum = 0;
  messages.forEach(m => tokensSum += estimateTokens(m.content));
  estimatedSessionTokens = tokensSum;

  updateHUDBadges();

  const payload = {
    type: manual ? 'MANUAL_SAVE_CHAT' : 'CAPTURE_CHAT',
    data: {
      id: convoId,
      title: currentChatTitle,
      platform: 'chatgpt' as const,
      url: window.location.href,
      messages,
    }
  };

  chrome.runtime.sendMessage(payload, (response) => {
    if (chrome.runtime.lastError) {
      console.warn('Capture sync communication failed:', chrome.runtime.lastError.message);
      updateHUDStatus('Bridge Offline', 'danger');
      return;
    }

    if (response?.success) {
      if (manual || response.saved) {
        updateHUDStatus('Context Synced', 'success');
        triggerGlowAnimation();
      } else {
        updateHUDStatus('Auto-save Off', 'warning');
      }
    } else {
      updateHUDStatus('Sync Error', 'danger');
    }
  });
}

// --- HUD UI Component Injection ---

function injectHUD() {
  if (document.getElementById('ai-context-bridge-hud')) return;

  hudContainer = document.createElement('div');
  hudContainer.id = 'ai-context-bridge-hud';
  
  // High-end cyber aesthetic stylesheet creation
  const style = document.createElement('style');
  style.textContent = `
    #ai-context-bridge-hud {
      position: fixed;
      bottom: 20px;
      right: 20px;
      z-index: 999999;
      background: rgba(11, 15, 25, 0.85);
      backdrop-filter: blur(10px);
      -webkit-backdrop-filter: blur(10px);
      border: 1px solid rgba(59, 130, 246, 0.35);
      border-radius: 12px;
      padding: 10px 14px;
      color: #f3f4f6;
      font-family: 'Outfit', 'Inter', sans-serif;
      font-size: 13px;
      display: flex;
      align-items: center;
      gap: 12px;
      box-shadow: 0 8px 32px 0 rgba(0, 0, 0, 0.4), 0 0 15px rgba(59, 130, 246, 0.15);
      transition: all 0.3s cubic-bezier(0.4, 0, 0.2, 1);
      user-select: none;
    }
    #ai-context-bridge-hud:hover {
      border-color: rgba(168, 85, 247, 0.5);
      box-shadow: 0 8px 32px 0 rgba(0, 0, 0, 0.4), 0 0 20px rgba(168, 85, 247, 0.25);
    }
    .bridge-dot {
      width: 8px;
      height: 8px;
      border-radius: 50%;
      background-color: #10b981;
      display: inline-block;
      box-shadow: 0 0 8px #10b981;
      transition: all 0.3s ease;
    }
    .bridge-dot.warning { background-color: #f59e0b; box-shadow: 0 0 8px #f59e0b; }
    .bridge-dot.danger { background-color: #ef4444; box-shadow: 0 0 8px #ef4444; }
    .bridge-dot.success { background-color: #10b981; box-shadow: 0 0 8px #10b981; }
    
    .bridge-btn {
      background: linear-gradient(135deg, #1f2937, #111827);
      border: 1px solid rgba(255, 255, 255, 0.1);
      border-radius: 6px;
      color: #f3f4f6;
      padding: 4px 8px;
      cursor: pointer;
      font-size: 11px;
      font-weight: 500;
      transition: all 0.2s ease;
    }
    .bridge-btn:hover {
      background: linear-gradient(135deg, rgba(59, 130, 246, 0.1), rgba(168, 85, 247, 0.1));
      border-color: rgba(59, 130, 246, 0.5);
      box-shadow: 0 0 8px rgba(59, 130, 246, 0.2);
    }
    .bridge-btn.syncing {
      background: rgba(16, 185, 129, 0.2) !important;
      border-color: #10b981 !important;
      color: #10b981 !important;
      animation: pulse 1s infinite alternate;
    }
    @keyframes pulse {
      0% { opacity: 0.6; }
      100% { opacity: 1; }
    }
  `;
  document.head.appendChild(style);

  // Status Indicator
  statusDot = document.createElement('span');
  statusDot.className = 'bridge-dot success';

  const statusText = document.createElement('span');
  statusText.id = 'bridge-status-text';
  statusText.textContent = 'Bridge Connected';
  statusText.style.fontWeight = '600';
  statusText.style.letterSpacing = '0.5px';

  // Token Badge
  tokenBadge = document.createElement('span');
  tokenBadge.id = 'bridge-token-badge';
  tokenBadge.style.color = '#9ca3af';
  tokenBadge.style.fontSize = '11px';
  tokenBadge.style.background = '#111827';
  tokenBadge.style.padding = '2px 6px';
  tokenBadge.style.borderRadius = '4px';
  tokenBadge.style.border = '1px solid rgba(255, 255, 255, 0.05)';
  tokenBadge.textContent = '0 tokens';

  // Sync Button
  syncBtn = document.createElement('button');
  syncBtn.className = 'bridge-btn';
  syncBtn.textContent = 'Sync Context';
  syncBtn.onclick = () => {
    if (syncBtn) {
      syncBtn.textContent = 'Syncing...';
      syncBtn.className = 'bridge-btn syncing';
      setTimeout(() => {
        captureAndSync(true);
        if (syncBtn) {
          syncBtn.textContent = 'Sync Context';
          syncBtn.className = 'bridge-btn';
        }
      }, 600);
    }
  };

  // Options Workspace Button
  const openWorkspaceBtn = document.createElement('button');
  openWorkspaceBtn.className = 'bridge-btn';
  openWorkspaceBtn.textContent = 'Workspace';
  openWorkspaceBtn.onclick = () => {
    chrome.runtime.sendMessage({ type: 'CONTINUE_IN_CLAUDE', data: { formattedContext: '' } }, () => {
      // Background message will trigger opening chrome://extensions options, 
      // but standard Chrome runtime supports opening the dashboard options page:
      chrome.runtime.sendMessage({ type: 'GET_PENDING_CONTEXT' }); // handshake
      window.open(chrome.runtime.getURL('dashboard.html'), '_blank');
    });
  };

  hudContainer.appendChild(statusDot);
  hudContainer.appendChild(statusText);
  hudContainer.appendChild(tokenBadge);
  hudContainer.appendChild(syncBtn);
  hudContainer.appendChild(openWorkspaceBtn);
  
  document.body.appendChild(hudContainer);
}

function updateHUDStatus(text: string, type: 'success' | 'warning' | 'danger') {
  const statusText = document.getElementById('bridge-status-text');
  if (statusText) statusText.textContent = text;

  if (statusDot) {
    statusDot.className = `bridge-dot ${type}`;
  }
}

function updateHUDBadges() {
  if (tokenBadge) {
    const formatted = estimatedSessionTokens >= 1000 
      ? (estimatedSessionTokens / 1000).toFixed(1) + 'k' 
      : estimatedSessionTokens.toString();
    tokenBadge.textContent = `${formatted} tokens | ${capturedMessageCount} msgs`;
  }
}

function triggerGlowAnimation() {
  if (hudContainer) {
    hudContainer.style.borderColor = '#10b981';
    hudContainer.style.boxShadow = '0 8px 32px 0 rgba(0, 0, 0, 0.4), 0 0 25px rgba(16, 185, 129, 0.5)';
    setTimeout(() => {
      if (hudContainer) {
        hudContainer.style.borderColor = 'rgba(59, 130, 246, 0.35)';
        hudContainer.style.boxShadow = '0 8px 32px 0 rgba(0, 0, 0, 0.4), 0 0 15px rgba(59, 130, 246, 0.15)';
      }
    }, 1500);
  }
}

// --- Watcher Observers ---

let lastUrl = window.location.href;
setInterval(() => {
  if (window.location.href !== lastUrl) {
    lastUrl = window.location.href;
    console.log('Context Bridge: URL changed, recapturing...');
    updateHUDStatus('Detecting Chat...', 'warning');
    setTimeout(() => captureAndSync(false), 1500); // Wait for DOM to adjust
  }
}, 1000);

// Watch DOM adjustments to detect incoming streaming words in active chat
let domObserver: MutationObserver | null = null;
function setupMutationObserver() {
  if (domObserver) {
    domObserver.disconnect();
  }

  // Observe body changes to catch new chat bubbles rendering
  domObserver = new MutationObserver((mutations) => {
    let shouldCapture = false;
    for (const mutation of mutations) {
      if (mutation.addedNodes.length > 0) {
        // Look for custom ChatGPT bubble class marks
        mutation.addedNodes.forEach((node) => {
          if (node instanceof HTMLElement) {
            if (
              node.getAttribute('data-message-author-role') ||
              node.querySelector('[data-message-author-role]') ||
              node.classList.contains('markdown')
            ) {
              shouldCapture = true;
            }
          }
        });
      }
    }

    if (shouldCapture) {
      // Debounce slightly to capture complete stream packets
      debounceCapture();
    }
  });

  domObserver.observe(document.body, { childList: true, subtree: true });
  console.log('Context Bridge: Mutation Observer initialized.');
}

let debounceTimeout: number | null = null;
function debounceCapture() {
  if (debounceTimeout) {
    clearTimeout(debounceTimeout);
  }
  // Check stream completion after a brief typing pause
  debounceTimeout = window.setTimeout(() => {
    captureAndSync(false);
  }, 2000);
}

// --- Startup Initialization ---

function init() {
  console.log('AI Context Bridge initialized on ChatGPT page.');
  
  // Inject visual controller HUD
  injectHUD();

  // Perform initial capture
  setTimeout(() => {
    captureAndSync(false);
    setupMutationObserver();
  }, 2000);
}

// Support lazy DOM mounting
if (document.readyState === 'complete' || document.readyState === 'interactive') {
  init();
} else {
  window.addEventListener('DOMContentLoaded', init);
}
