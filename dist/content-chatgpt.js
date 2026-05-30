"use strict";
(() => {
  // src/extension/content-chatgpt.ts
  function estimateTokens(text) {
    if (!text) return 0;
    const charCount = text.length;
    const wordCount = text.trim().split(/\s+/).length;
    const base = (charCount / 4 + wordCount / 0.75) / 2;
    const symbols = (text.match(/[{}[\]()<>`+\-*/=%;&|]/g) || []).length;
    return Math.max(1, Math.round(base + symbols * 0.4));
  }
  var activeConversationId = null;
  var currentChatTitle = "New ChatGPT Conversation";
  var capturedMessageCount = 0;
  var estimatedSessionTokens = 0;
  var hudContainer = null;
  var tokenBadge = null;
  var statusDot = null;
  var syncBtn = null;
  function getConversationId() {
    const match = window.location.pathname.match(/\/c\/([a-f0-9-]+)/i);
    return match ? match[1] : null;
  }
  function scrapeTitle() {
    let title = document.title;
    if (title) {
      title = title.replace(" - ChatGPT", "").replace("ChatGPT", "").trim();
      if (title && title !== "New chat" && title !== "New Chat") {
        return title;
      }
    }
    const firstUserMsg = document.querySelector('[data-message-author-role="user"]');
    if (firstUserMsg && firstUserMsg.textContent) {
      const text = firstUserMsg.textContent.trim();
      return text.length > 30 ? text.slice(0, 30) + "..." : text;
    }
    return "ChatGPT Conversation";
  }
  function scrapeMessages() {
    const turns = document.querySelectorAll("[data-message-author-role]");
    const messages = [];
    turns.forEach((turn, idx) => {
      const role = turn.getAttribute("data-message-author-role");
      if (role !== "user" && role !== "assistant") return;
      let text = "";
      if (role === "assistant") {
        const markdownContainer = turn.querySelector(".markdown");
        text = markdownContainer ? markdownContainer.innerText : turn.innerText;
      } else {
        const userTextContainer = turn.querySelector(".flex-col.max-w-full") || turn;
        text = userTextContainer.innerText || "";
      }
      text = text.replace(/Copy code/g, "").replace(/Copy/g, "").replace(/🧠\s*Memory\s*updated/g, "").trim();
      if (text) {
        messages.push({
          role,
          content: text,
          timestamp: Date.now() - (turns.length - idx) * 1e3
          // heuristic ordering fallback
        });
      }
    });
    return messages;
  }
  function captureAndSync(manual = false) {
    const convoId = getConversationId();
    if (!convoId) {
      updateHUDStatus("Waiting for chat ID...", "warning");
      return;
    }
    activeConversationId = convoId;
    currentChatTitle = scrapeTitle();
    const messages = scrapeMessages();
    if (messages.length === 0) {
      updateHUDStatus("Empty Chat", "warning");
      return;
    }
    capturedMessageCount = messages.length;
    let tokensSum = 0;
    messages.forEach((m) => tokensSum += estimateTokens(m.content));
    estimatedSessionTokens = tokensSum;
    updateHUDBadges();
    const payload = {
      type: manual ? "MANUAL_SAVE_CHAT" : "CAPTURE_CHAT",
      data: {
        id: convoId,
        title: currentChatTitle,
        platform: "chatgpt",
        url: window.location.href,
        messages
      }
    };
    chrome.runtime.sendMessage(payload, (response) => {
      if (chrome.runtime.lastError) {
        console.warn("Capture sync communication failed:", chrome.runtime.lastError.message);
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
    tokenBadge.textContent = "0 tokens";
    syncBtn = document.createElement("button");
    syncBtn.className = "bridge-btn";
    syncBtn.textContent = "Sync Context";
    syncBtn.onclick = () => {
      if (syncBtn) {
        syncBtn.textContent = "Syncing...";
        syncBtn.className = "bridge-btn syncing";
        setTimeout(() => {
          captureAndSync(true);
          if (syncBtn) {
            syncBtn.textContent = "Sync Context";
            syncBtn.className = "bridge-btn";
          }
        }, 600);
      }
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
  function updateHUDStatus(text, type) {
    const statusText = document.getElementById("bridge-status-text");
    if (statusText) statusText.textContent = text;
    if (statusDot) {
      statusDot.className = `bridge-dot ${type}`;
    }
  }
  function updateHUDBadges() {
    if (tokenBadge) {
      const formatted = estimatedSessionTokens >= 1e3 ? (estimatedSessionTokens / 1e3).toFixed(1) + "k" : estimatedSessionTokens.toString();
      tokenBadge.textContent = `${formatted} tokens | ${capturedMessageCount} msgs`;
    }
  }
  function triggerGlowAnimation() {
    if (hudContainer) {
      hudContainer.style.borderColor = "#10b981";
      hudContainer.style.boxShadow = "0 8px 32px 0 rgba(0, 0, 0, 0.4), 0 0 25px rgba(16, 185, 129, 0.5)";
      setTimeout(() => {
        if (hudContainer) {
          hudContainer.style.borderColor = "rgba(59, 130, 246, 0.35)";
          hudContainer.style.boxShadow = "0 8px 32px 0 rgba(0, 0, 0, 0.4), 0 0 15px rgba(59, 130, 246, 0.15)";
        }
      }, 1500);
    }
  }
  var lastUrl = window.location.href;
  setInterval(() => {
    if (window.location.href !== lastUrl) {
      lastUrl = window.location.href;
      console.log("Context Bridge: URL changed, recapturing...");
      updateHUDStatus("Detecting Chat...", "warning");
      setTimeout(() => captureAndSync(false), 1500);
    }
  }, 1e3);
  var domObserver = null;
  function setupMutationObserver() {
    if (domObserver) {
      domObserver.disconnect();
    }
    domObserver = new MutationObserver((mutations) => {
      let shouldCapture = false;
      for (const mutation of mutations) {
        if (mutation.addedNodes.length > 0) {
          mutation.addedNodes.forEach((node) => {
            if (node instanceof HTMLElement) {
              if (node.getAttribute("data-message-author-role") || node.querySelector("[data-message-author-role]") || node.classList.contains("markdown")) {
                shouldCapture = true;
              }
            }
          });
        }
      }
      if (shouldCapture) {
        debounceCapture();
      }
    });
    domObserver.observe(document.body, { childList: true, subtree: true });
    console.log("Context Bridge: Mutation Observer initialized.");
  }
  var debounceTimeout = null;
  function debounceCapture() {
    if (debounceTimeout) {
      clearTimeout(debounceTimeout);
    }
    debounceTimeout = window.setTimeout(() => {
      captureAndSync(false);
    }, 2e3);
  }
  function init() {
    console.log("AI Context Bridge initialized on ChatGPT page.");
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
