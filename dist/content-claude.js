"use strict";
(() => {
  // src/extension/content-claude.ts
  console.log("AI Context Bridge initialized on Claude page.");
  function findClaudeInputElement() {
    const selectors = [
      'div[contenteditable="true"]',
      "textarea",
      '[data-testid="chat-input"]',
      ".ProseMirror",
      "div.flex-1.overflow-y-auto"
      // parent input block search fallback
    ];
    for (const selector of selectors) {
      const el = document.querySelector(selector);
      if (el instanceof HTMLElement) {
        if (selector === "textarea" || el.getAttribute("contenteditable") === "true" || el.classList.contains("ProseMirror")) {
          return el;
        }
      }
    }
    const editableEl = document.querySelector("[contenteditable]");
    if (editableEl instanceof HTMLElement) {
      return editableEl;
    }
    return null;
  }
  function injectContext(element, contextText) {
    element.focus();
    if (element.getAttribute("contenteditable") === "true" || element.classList.contains("ProseMirror")) {
      element.innerHTML = "";
      const lines = contextText.split("\n");
      lines.forEach((line) => {
        const p = document.createElement("p");
        p.textContent = line.trim() === "" ? "\xA0" : line;
        element.appendChild(p);
      });
    } else if (element instanceof HTMLTextAreaElement || element instanceof HTMLInputElement) {
      element.value = contextText;
    }
    const inputEvent = new Event("input", { bubbles: true, cancelable: true });
    element.dispatchEvent(inputEvent);
    const changeEvent = new Event("change", { bubbles: true, cancelable: true });
    element.dispatchEvent(changeEvent);
    const keyEvent = new KeyboardEvent("keydown", { key: "a", bubbles: true });
    element.dispatchEvent(keyEvent);
    const keyUpEvent = new KeyboardEvent("keyup", { key: "a", bubbles: true });
    element.dispatchEvent(keyUpEvent);
    console.log("AI Context Bridge: Context injected into Claude successfully!");
    showSuccessToast();
  }
  function showSuccessToast() {
    const toast = document.createElement("div");
    toast.id = "bridge-success-toast";
    const style = document.createElement("style");
    style.textContent = `
    #bridge-success-toast {
      position: fixed;
      top: 20px;
      right: 20px;
      z-index: 999999;
      background: rgba(16, 185, 129, 0.95);
      border: 1px solid #10b981;
      border-radius: 8px;
      padding: 12px 18px;
      color: #ffffff;
      font-family: 'Outfit', 'Inter', sans-serif;
      font-size: 13px;
      font-weight: 500;
      box-shadow: 0 4px 12px rgba(16, 185, 129, 0.3), 0 10px 30px rgba(0, 0, 0, 0.2);
      animation: toast-in 0.4s cubic-bezier(0.16, 1, 0.3, 1), toast-out 0.4s 4.5s cubic-bezier(0.16, 1, 0.3, 1) forwards;
      display: flex;
      align-items: center;
      gap: 10px;
    }
    @keyframes toast-in {
      from { transform: translateY(-20px); opacity: 0; }
      to { transform: translateY(0); opacity: 1; }
    }
    @keyframes toast-out {
      from { transform: translateY(0); opacity: 1; }
      to { transform: translateY(-20px); opacity: 0; }
    }
  `;
    document.head.appendChild(style);
    toast.innerHTML = "<span>\u2705</span> <span><strong>AI Context Bridge:</strong> Project history and conversation details injected successfully! Ready to send.</span>";
    document.body.appendChild(toast);
    setTimeout(() => {
      toast.remove();
    }, 5e3);
  }
  function performHandshake() {
    chrome.runtime.sendMessage({ type: "GET_PENDING_CONTEXT" }, (response) => {
      if (chrome.runtime.lastError) {
        console.warn("Claude Bridge handshake failed (communication inactive):", chrome.runtime.lastError.message);
        return;
      }
      if (response?.hasContext && response.context) {
        console.log("AI Context Bridge: Pending context detected. Initiating injection process...");
        let attempts = 0;
        const maxAttempts = 30;
        const interval = setInterval(() => {
          attempts++;
          const el = findClaudeInputElement();
          if (el) {
            clearInterval(interval);
            setTimeout(() => injectContext(el, response.context), 500);
          } else if (attempts >= maxAttempts) {
            clearInterval(interval);
            console.error("AI Context Bridge: Failed to locate Claude prompt text-box in DOM after 9s.");
          }
        }, 300);
      }
    });
  }
  if (document.readyState === "complete" || document.readyState === "interactive") {
    performHandshake();
  } else {
    window.addEventListener("DOMContentLoaded", performHandshake);
  }
})();
