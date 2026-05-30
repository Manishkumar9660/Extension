import { saveCapturedConversation, getConversation, getConversationMessages } from '../services/db';

interface PendingContext {
  formattedContext: string;
}

interface SaveTurnMessage {
  site: string;
  role: 'user' | 'assistant';
  text: string;
  url: string;
  timestamp: number;
}

// Memory cache for tab redirection and text injection
const pendingContexts: Record<number, PendingContext> = {};

console.log('AI Context Bridge Service Worker Active.');

function normalizePlatform(site: string): 'chatgpt' | 'claude' | 'gemini' | 'deepseek' {
  const hostname = site.toLowerCase();

  if (hostname.includes('chatgpt') || hostname.includes('openai')) {
    return 'chatgpt';
  }

  if (hostname.includes('claude')) {
    return 'claude';
  }

  if (hostname.includes('gemini')) {
    return 'gemini';
  }

  return 'deepseek';
}

function buildFallbackTitle(site: string, text: string, url: string): string {
  const cleanText = text.trim();

  if (cleanText) {
    return cleanText.length > 40 ? `${cleanText.slice(0, 37)}...` : cleanText;
  }

  if (url) {
    return `Captured context from ${site}`;
  }

  return `${site} conversation`;
}

async function saveTurnCapture(payload: SaveTurnMessage) {
  const sanitizedText = payload.text?.trim();
  const url = payload.url?.trim() || `https://${payload.site}`;

  console.log('[AI Context Bridge] SAVE_TURN received', {
    site: payload.site,
    role: payload.role,
    textLength: sanitizedText?.length ?? 0,
    url
  });

  if (!sanitizedText) {
    console.warn('[AI Context Bridge] SAVE_TURN skipped because text is empty', {
      site: payload.site,
      url
    });
    return;
  }

  const existingConversation = await getConversation(url);
  const existingMessages = await getConversationMessages(url);

  const duplicateTurn = existingMessages.some((message) =>
    message.role === payload.role &&
    message.content === sanitizedText
  );

  if (duplicateTurn) {
    console.log('[AI Context Bridge] SAVE_TURN skipped duplicate', {
      site: payload.site,
      url,
      role: payload.role,
      textLength: sanitizedText.length
    });
    return;
  }

  const nextMessages = [
    ...existingMessages,
    {
      role: payload.role,
      content: sanitizedText,
      timestamp: payload.timestamp || Date.now(),
    },
  ];

  const title = existingConversation?.title || buildFallbackTitle(payload.site, sanitizedText, url);

  console.log('[AI Context Bridge] saving turn to IndexedDB', {
    site: payload.site,
    url,
    conversationExists: !!existingConversation,
    existingMessages: existingMessages.length,
    nextMessages: nextMessages.length,
    title
  });

  await saveCapturedConversation(
    url,
    title,
    normalizePlatform(payload.site),
    url,
    nextMessages
  );

  console.log('[AI Context Bridge] SAVE_TURN persisted successfully', {
    site: payload.site,
    url,
    title
  });
}

// Handle installation
chrome.runtime.onInstalled.addListener(() => {
  console.log('AI Context Bridge Extension Installed Successfully.');
  // Initialize default options if not present
  chrome.storage.local.get({
    theme: 'dark',
    autoSave: true,
    encryptionEnabled: false,
    masterKeyJwk: null
  }, (settings) => {
    chrome.storage.local.set(settings);
  });
});

// Main Message Orchestrator
chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  // Generic turn-based capture from content-capture.ts
  if (message.type === 'SAVE_TURN') {
    saveTurnCapture(message.payload as SaveTurnMessage)
      .then(() => {
        sendResponse({ success: true });
      })
      .catch((error) => {
        console.error('Turn capture save failed:', error);
        sendResponse({ success: false, error: String(error) });
      });

    return true;
  }

  // Real-time capturing from content scripts
  if (message.type === 'CAPTURE_CHAT') {
    const { id, title, platform, url, messages } = message.data;

    chrome.storage.local.get({ autoSave: true }, async (res) => {
      if (res.autoSave) {
        try {
          await saveCapturedConversation(id, title, platform, url, messages);
          sendResponse({ success: true, saved: true });
        } catch (error) {
          console.error('Auto-save database transaction failed:', error);
          sendResponse({ success: false, error: String(error) });
        }
      } else {
        // Auto-save disabled, but we report successful bypass
        sendResponse({ success: true, saved: false });
      }
    });
    return true; // Asynchronous reply channel
  }

  // Manual save triggered by content script visual controls
  if (message.type === 'MANUAL_SAVE_CHAT') {
    const { id, title, platform, url, messages } = message.data;

    saveCapturedConversation(id, title, platform, url, messages)
      .then(() => {
        sendResponse({ success: true });
      })
      .catch((error) => {
        console.error('Manual save database transaction failed:', error);
        sendResponse({ success: false, error: String(error) });
      });
    return true;
  }

  // Migration trigger: Continue in Claude
  if (message.type === 'CONTINUE_IN_CLAUDE') {
    const { formattedContext } = message.data;

    chrome.tabs.create({ url: 'https://claude.ai/new' }, (tab) => {
      if (tab && tab.id) {
        pendingContexts[tab.id] = { formattedContext };
        sendResponse({ success: true, tabId: tab.id });
      } else {
        sendResponse({ success: false, error: 'Could not create new Claude tab.' });
      }
    });
    return true;
  }

  // Claude content script fetching context injection payload
  if (message.type === 'GET_PENDING_CONTEXT') {
    const tabId = sender.tab?.id;
    if (tabId && pendingContexts[tabId]) {
      const payload = pendingContexts[tabId];
      // Clean up cache to prevent memory leaks and repeated injections
      delete pendingContexts[tabId];
      sendResponse({ hasContext: true, context: payload.formattedContext });
    } else {
      sendResponse({ hasContext: false });
    }
    return false; // Synchronous response
  }

  return false;
});
