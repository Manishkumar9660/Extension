"use strict";
(() => {
  // src/extension/content-capture.ts
  (() => {
    const SITE_ADAPTERS = {
      "chatgpt.com": {
        turnSelector: "[data-message-author-role]",
        getRole: (el) => el.dataset.messageAuthorRole,
        getText: (el) => el.querySelector(".markdown, .text-base")?.innerText?.trim()
      },
      "chat.openai.com": {
        turnSelector: "[data-message-author-role]",
        getRole: (el) => el.dataset.messageAuthorRole,
        getText: (el) => el.querySelector(".markdown, .text-base")?.innerText?.trim()
      },
      "gemini.google.com": {
        turnSelector: "user-query, model-response",
        getRole: (el) => el.tagName.toLowerCase() === "user-query" ? "user" : "assistant",
        getText: (el) => el.querySelector(".query-text, .response-content")?.innerText?.trim()
      },
      "www.perplexity.ai": {
        turnSelector: "[class*='UserMessage'], [class*='AnswerBody']",
        getRole: (el) => el.className.includes("UserMessage") ? "user" : "assistant",
        getText: (el) => el.innerText?.trim()
      },
      "grok.com": {
        turnSelector: "[class*='UserMessage'], [class*='AssistantMessage']",
        getRole: (el) => el.className.includes("UserMessage") ? "user" : "assistant",
        getText: (el) => el.innerText?.trim()
      },
      "copilot.microsoft.com": {
        turnSelector: "[class*='user-message'], [class*='bot-message']",
        getRole: (el) => el.className.includes("user-message") ? "user" : "assistant",
        getText: (el) => el.innerText?.trim()
      },
      "you.com": {
        turnSelector: "[data-testid*='message']",
        getRole: (el) => el.dataset.testid?.includes("human") ? "user" : "assistant",
        getText: (el) => el.innerText?.trim()
      },
      "claude.ai": {
        turnSelector: '[data-message-author-role], [data-testid*="message"], [class*="user-message"], [class*="assistant-message"], [class*="UserMessage"], [class*="AssistantMessage"]',
        getRole: (el) => {
          const html = el;
          const role = html.getAttribute("data-message-author-role");
          if (role === "user" || role === "assistant") return role;
          if (html.dataset.testid?.includes("human") || html.className.includes("user-message") || html.className.includes("UserMessage")) {
            return "user";
          }
          return "assistant";
        },
        getText: (el) => {
          const html = el;
          const candidate = html.querySelector('.markdown, .text-base, .query-text, .response-content, [class*="content"], [class*="message"]');
          const text = candidate?.innerText?.trim() || html.innerText?.trim();
          return text ? text.replace(/\b(Copy|Copy code|Regenerate|Retry|Edit|Thumbs up|Thumbs down)\b/gi, "").replace(/\s+/g, " ").trim() : void 0;
        }
      }
    };
    function cleanText(text) {
      return text.replace(/\b(Copy|Copy code|Regenerate|Retry|Edit|Thumbs up|Thumbs down)\b/gi, "").replace(/\s+/g, " ").trim();
    }
    function inferRole(el) {
      const html = el;
      const role = html.getAttribute("data-message-author-role");
      if (role === "user" || role === "assistant") {
        return role;
      }
      const className = html.className || "";
      const testId = html.dataset.testid || "";
      if (/user|human|prompt/i.test(`${className} ${testId}`)) {
        return "user";
      }
      if (/assistant|bot|model|response/i.test(`${className} ${testId}`)) {
        return "assistant";
      }
      return "assistant";
    }
    function estimateTokens(text) {
      if (!text) return 0;
      const charCount = text.length;
      const wordCount = text.trim().split(/\s+/).length;
      const base = (charCount / 4 + wordCount / 0.75) / 2;
      const symbols = (text.match(/[{}[\]()<>`+\-*/=%;&|]/g) || []).length;
      return Math.max(1, Math.round(base + symbols * 0.4));
    }
    function normalizePlatform(hostname) {
      const normalized = hostname.toLowerCase();
      if (normalized.includes("chatgpt") || normalized.includes("openai")) {
        return "chatgpt";
      }
      if (normalized.includes("claude")) {
        return "claude";
      }
      if (normalized.includes("gemini")) {
        return "gemini";
      }
      return "deepseek";
    }
    function getAdapter() {
      return SITE_ADAPTERS[location.hostname] || makeGenericAdapter();
    }
    function makeGenericAdapter() {
      return {
        turnSelector: '[data-message-author-role], [data-testid*="message"], [class*="UserMessage"], [class*="AssistantMessage"], [class*="user-message"], [class*="bot-message"], user-query, model-response, [class*="prompt"], [class*="response"]',
        getRole: inferRole,
        getText: (el) => {
          const html = el;
          const selectors = [
            ".markdown",
            ".text-base",
            ".query-text",
            ".response-content",
            '[class*="content"]',
            '[class*="message"]',
            '[class*="answer"]',
            '[class*="prompt"]',
            '[class*="response"]'
          ];
          for (const selector of selectors) {
            const candidate = html.querySelector(selector);
            if (!candidate) continue;
            const text2 = cleanText(candidate.innerText || "");
            if (text2) return text2;
          }
          const text = cleanText(html.innerText || "");
          return text || void 0;
        }
      };
    }
    function getConversationId() {
      const pathMatch = window.location.pathname.match(/\/c\/([a-z0-9-]+)/i) || window.location.pathname.match(/\/chat\/([a-z0-9-]+)/i) || window.location.pathname.match(/\/conversation\/([a-z0-9-]+)/i);
      if (pathMatch?.[1]) {
        return pathMatch[1];
      }
      const params = new URL(window.location.href).searchParams;
      return params.get("conversationId") || params.get("id") || null;
    }
    function scrubTitle(title) {
      return title.replace(/\s*-\s*ChatGPT$/i, "").replace(/\s*ChatGPT$/i, "").replace(/\s*-\s*Claude$/i, "").replace(/\s*Claude$/i, "").replace(/\s*-\s*Gemini$/i, "").replace(/\s*Gemini$/i, "").trim();
    }
    function extractTurnText(el, adapter) {
      const direct = adapter.getText(el);
      if (direct) return direct;
      const html = el;
      const text = cleanText(html.innerText || "");
      return text || void 0;
    }
    function collectMessageElements() {
      const adapter = getAdapter();
      const selectorList = [
        adapter.turnSelector,
        "[data-message-author-role]",
        '[data-testid*="message"]',
        '[class*="UserMessage"]',
        '[class*="AssistantMessage"]',
        '[class*="user-message"]',
        '[class*="assistant-message"]',
        "user-query",
        "model-response",
        '[class*="prompt"]',
        '[class*="response"]'
      ];
      const seen = /* @__PURE__ */ new Set();
      const candidates = [];
      selectorList.forEach((selector) => {
        document.querySelectorAll(selector).forEach((node) => {
          if (node instanceof Element && !seen.has(node)) {
            seen.add(node);
            candidates.push(node);
          }
        });
      });
      return candidates.filter((node) => {
        const text = extractTurnText(node, adapter);
        return Boolean(text && text.length >= 5);
      }).filter((node, index, all) => {
        return !all.some((other, otherIndex) => {
          return otherIndex !== index && other.contains(node);
        });
      }).sort((a, b) => {
        const aPos = a.compareDocumentPosition(b);
        if (aPos & Node.DOCUMENT_POSITION_FOLLOWING) return -1;
        if (aPos & Node.DOCUMENT_POSITION_PRECEDING) return 1;
        return 0;
      });
    }
    let currentChatTitle = "New Conversation";
    let capturedMessageCount = 0;
    let estimatedSessionTokens = 0;
    let hudContainer = null;
    let tokenBadge = null;
    let statusDot = null;
    let syncBtn = null;
    function scrapeTitle() {
      let title = document.title;
      title = scrubTitle(title);
      if (title && title !== "New chat" && title !== "New Chat" && title !== "New conversation" && title !== "New Conversation") {
        return title;
      }
      const adapter = getAdapter();
      const firstUser = collectMessageElements().find((el) => adapter.getRole(el) === "user");
      if (firstUser) {
        const text = extractTurnText(firstUser, adapter);
        if (text) {
          return text.length > 30 ? `${text.slice(0, 30)}...` : text;
        }
      }
      return `${location.hostname} Conversation`;
    }
    function scrapeMessages() {
      const adapter = getAdapter();
      const turns = collectMessageElements();
      const messages = [];
      const seen = /* @__PURE__ */ new Set();
      turns.forEach((turn, idx) => {
        const role = adapter.getRole(turn);
        const text = extractTurnText(turn, adapter);
        if (!text) {
          return;
        }
        const normalized = `${role}:${cleanText(text)}`;
        if (seen.has(normalized)) {
          return;
        }
        seen.add(normalized);
        messages.push({
          role,
          content: cleanText(text),
          timestamp: Date.now() - (turns.length - idx) * 1e3
        });
      });
      console.log("[AI Context Bridge] scrapeMessages", {
        hostname: location.hostname,
        count: messages.length,
        turns: turns.length
      });
      return messages;
    }
    function updateHUDStatus(text, type) {
      const statusText = document.getElementById("bridge-status-text");
      if (statusText) {
        statusText.textContent = text;
      }
      if (statusDot) {
        statusDot.className = `bridge-dot ${type}`;
      }
    }
    function updateHUDBadges() {
      if (tokenBadge) {
        const formatted = estimatedSessionTokens >= 1e3 ? `${(estimatedSessionTokens / 1e3).toFixed(1)}k` : estimatedSessionTokens.toString();
        tokenBadge.textContent = `${formatted} tokens | ${capturedMessageCount} msgs`;
      }
    }
    function triggerGlowAnimation() {
      if (!hudContainer) return;
      hudContainer.style.borderColor = "#10b981";
      hudContainer.style.boxShadow = "0 8px 32px 0 rgba(0, 0, 0, 0.4), 0 0 25px rgba(16, 185, 129, 0.5)";
      setTimeout(() => {
        if (hudContainer) {
          hudContainer.style.borderColor = "rgba(59, 130, 246, 0.35)";
          hudContainer.style.boxShadow = "0 8px 32px 0 rgba(0, 0, 0, 0.4), 0 0 15px rgba(59, 130, 246, 0.15)";
        }
      }, 1500);
    }
    function injectHUD() {
      if (document.getElementById("ai-context-bridge-hud")) return;
      hudContainer = document.createElement("div");
      hudContainer.id = "ai-context-bridge-hud";
      const style = document.createElement("style");
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
      statusDot = document.createElement("span");
      statusDot.className = "bridge-dot success";
      const statusText = document.createElement("span");
      statusText.id = "bridge-status-text";
      statusText.textContent = "Bridge Connected";
      statusText.style.fontWeight = "600";
      statusText.style.letterSpacing = "0.5px";
      tokenBadge = document.createElement("span");
      tokenBadge.id = "bridge-token-badge";
      tokenBadge.style.color = "#9ca3af";
      tokenBadge.style.fontSize = "11px";
      tokenBadge.style.background = "#111827";
      tokenBadge.style.padding = "2px 6px";
      tokenBadge.style.borderRadius = "4px";
      tokenBadge.style.border = "1px solid rgba(255, 255, 255, 0.05)";
      tokenBadge.textContent = "0 tokens | 0 msgs";
      syncBtn = document.createElement("button");
      syncBtn.className = "bridge-btn";
      syncBtn.textContent = "Sync Context";
      syncBtn.onclick = () => {
        if (!syncBtn) return;
        console.log("[AI Context Bridge] manual sync requested", {
          hostname: location.hostname,
          url: location.href
        });
        syncBtn.textContent = "Syncing...";
        syncBtn.className = "bridge-btn syncing";
        updateHUDStatus("Syncing...", "warning");
        setTimeout(() => {
          captureAndSync(true);
          if (syncBtn) {
            syncBtn.textContent = "Sync Context";
            syncBtn.className = "bridge-btn";
          }
        }, 600);
      };
      const openWorkspaceBtn = document.createElement("button");
      openWorkspaceBtn.className = "bridge-btn";
      openWorkspaceBtn.textContent = "Workspace";
      openWorkspaceBtn.onclick = () => {
        chrome.runtime.sendMessage({ type: "CONTINUE_IN_CLAUDE", data: { formattedContext: "" } }, () => {
          chrome.runtime.sendMessage({ type: "GET_PENDING_CONTEXT" });
          window.open(chrome.runtime.getURL("dashboard.html"), "_blank");
        });
      };
      hudContainer.appendChild(statusDot);
      hudContainer.appendChild(statusText);
      hudContainer.appendChild(tokenBadge);
      hudContainer.appendChild(syncBtn);
      hudContainer.appendChild(openWorkspaceBtn);
      document.body.appendChild(hudContainer);
    }
    function captureAndSync(manual = false) {
      const convoId = getConversationId() || `generic-${encodeURIComponent(location.href)}`;
      currentChatTitle = scrapeTitle();
      const messages = scrapeMessages();
      console.log("[AI Context Bridge] captureAndSync", {
        hostname: location.hostname,
        manual,
        convoId,
        messageCount: messages.length,
        title: currentChatTitle
      });
      if (messages.length === 0) {
        updateHUDStatus("Empty Chat", "warning");
        return;
      }
      capturedMessageCount = messages.length;
      estimatedSessionTokens = messages.reduce((sum, message) => sum + estimateTokens(message.content), 0);
      updateHUDBadges();
      const payload = {
        type: manual ? "MANUAL_SAVE_CHAT" : "CAPTURE_CHAT",
        data: {
          id: convoId,
          title: currentChatTitle,
          platform: normalizePlatform(location.hostname),
          url: location.href,
          messages
        }
      };
      chrome.runtime.sendMessage(payload, (response) => {
        if (chrome.runtime.lastError) {
          console.warn("[AI Context Bridge] capture sync communication failed:", chrome.runtime.lastError.message);
          updateHUDStatus("Bridge Offline", "danger");
          return;
        }
        if (response?.success) {
          if (manual || response.saved) {
            updateHUDStatus("Context Synced", "success");
            triggerGlowAnimation();
          } else {
            updateHUDStatus("Auto-save Off", "warning");
          }
        } else {
          updateHUDStatus("Sync Error", "danger");
        }
      });
    }
    let domObserver = null;
    let debounceTimeout = null;
    function debounceCapture() {
      if (debounceTimeout) {
        clearTimeout(debounceTimeout);
      }
      debounceTimeout = window.setTimeout(() => {
        captureAndSync(false);
      }, 1500);
    }
    function setupMutationObserver() {
      if (domObserver) {
        domObserver.disconnect();
      }
      domObserver = new MutationObserver((mutations) => {
        let shouldCapture = false;
        for (const mutation of mutations) {
          if (mutation.addedNodes.length > 0) {
            mutation.addedNodes.forEach((node) => {
              if (!(node instanceof HTMLElement)) {
                return;
              }
              if (node.matches('[data-message-author-role], [data-testid*="message"], [class*="UserMessage"], [class*="AssistantMessage"], [class*="user-message"], [class*="bot-message"], user-query, model-response, [class*="prompt"], [class*="response"]') || node.querySelector('[data-message-author-role], [data-testid*="message"], [class*="UserMessage"], [class*="AssistantMessage"], [class*="user-message"], [class*="bot-message"], user-query, model-response, [class*="prompt"], [class*="response"]')) {
                shouldCapture = true;
              }
            });
          }
          if (mutation.type === "characterData") {
            shouldCapture = true;
          }
        }
        if (shouldCapture) {
          debounceCapture();
        }
      });
      domObserver.observe(document.body, { childList: true, subtree: true, characterData: true });
      console.log("[AI Context Bridge] Mutation Observer initialized.");
    }
    function init() {
      console.log("[AI Context Bridge] initialized on page:", location.hostname);
      injectHUD();
      setTimeout(() => {
        captureAndSync(false);
        setupMutationObserver();
      }, 2e3);
    }
    if (document.readyState === "complete" || document.readyState === "interactive") {
      init();
    } else {
      window.addEventListener("DOMContentLoaded", init);
    }
  })();
})();
