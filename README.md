# 🌉 AI Context Bridge

**Your AI conversations. Your context. Your control.**

AI Context Bridge is a local-first Chrome extension designed to preserve, organize, and transfer conversation context across AI platforms. It helps you maintain continuity between different AI assistants without repeatedly explaining your projects, preferences, or previous conversations.

## ✨ Features

- **🔄 Cross-Platform Context Transfer** — Capture and reuse conversation context across supported AI chat platforms.
- **💾 Local-First Storage** — Store conversation data locally in your browser using IndexedDB and Dexie.js.
- **🔐 Client-Side Encryption** — Protect sensitive stored context using the Web Crypto API with AES-GCM encryption and PBKDF2-based key derivation.
- **🔎 Search & Organization** — Search, categorize, and manage saved conversations and context.
- **📤 Export Conversations** — Export your context in Markdown, JSON, and TXT formats.
- **💬 Context Injection** — Reuse saved context in supported AI chat interfaces.
- **📊 Token Usage HUD** — View estimated token usage while interacting with supported platforms.
- **⚙️ Sync Controls** — Manage available storage and synchronization settings.

## 🤖 Supported AI Platforms

The extension is designed to work with:

- ChatGPT
- Claude
- Google Gemini
- Perplexity AI
- Grok

*Platform compatibility depends on the current implementation of each platform adapter and may vary as their interfaces change.*

## 🛠️ Tech Stack

| Technology | Purpose |
|---|---|
| TypeScript | Type-safe application logic |
| React 18 | User interface |
| Vite | Development and build tooling |
| Chrome Extension API (Manifest V3) | Browser integration |
| IndexedDB | Local data persistence |
| Dexie.js | IndexedDB management |
| Tailwind CSS | UI styling |
| Framer Motion | UI animations |
| Lucide Icons | Interface icons |
| Web Crypto API | Client-side encryption |

## 🏗️ Architecture

AI Context Bridge follows a local-first architecture.

1. **Capture:** Platform-specific content scripts and DOM adapters interact with supported AI chat interfaces.
2. **Process:** Conversation content is extracted and prepared for storage or reuse.
3. **Store:** IndexedDB, managed through Dexie.js, stores the saved context locally.
4. **Protect:** Encryption utilities protect stored context when encryption is enabled.
5. **Retrieve:** Users can search and organize saved context through the extension interface.
6. **Transfer:** Saved context can be exported or inserted into supported AI chat interfaces.

```text
AI Chat Platforms
        │
        ▼
 Content Scripts
  & DOM Adapters
        │
        ▼
 Conversation Processing
        │
        ▼
 Local Storage (IndexedDB)
        │
        ▼
 Search • Organize • Export
        │
        ▼
 Context Reuse Across AI Tools
```

## 🔒 Privacy & Security

Privacy is a core design principle of AI Context Bridge.

- Conversation data is stored locally in the browser.
- No external backend is required for the local-first workflow.
- The extension does not require AI provider API keys for its core context-management functionality.
- Browser-based cryptography supports AES-GCM encryption and PBKDF2-based key derivation.
- Encryption settings and storage behavior should be reviewed before storing sensitive information.

**Important:** Local storage and encryption do not automatically protect against every threat. Security depends on implementation details, key handling, browser security, and the device itself.

## 🚀 Getting Started

### Prerequisites

- Google Chrome or another compatible Chromium-based browser
- Node.js and npm
- Git

### 1. Clone the repository

```bash
git clone https://github.com/Manishkumar9660/Extension-main.git
cd Extension-main
```

### 2. Install dependencies

```bash
npm install
```

### 3. Build the extension

```bash
npm run build
```

Make sure the build completes successfully and generates the extension's distribution directory.

### 4. Load the extension into Chrome

1. Open `chrome://extensions/`.
2. Enable **Developer mode**.
3. Click **Load unpacked**.
4. Select the generated `dist` directory containing `manifest.json`.
5. Pin AI Context Bridge
