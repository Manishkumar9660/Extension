import Dexie, { type Table } from 'dexie';
import { encryptText, decryptText, importKeyFromJWK } from './crypto';

// --- Database Interfaces ---

export interface Project {
  id: string; // UUID v4
  name: string;
  description: string;
  createdAt: number;
  updatedAt: number;
}

export interface Conversation {
  id: string; // Unique URL hash or ChatGPT UUID
  projectId: string | null; // Belongs to project, or null (unassigned)
  title: string; // Captured chat title (can be encrypted)
  platform: 'chatgpt' | 'claude' | 'gemini' | 'deepseek';
  url: string;
  capturedAt: number;
  updatedAt: number;
  messageCount: number;
}

export interface Message {
  id: string; // UUID
  conversationId: string;
  role: 'user' | 'assistant';
  content: string; // Raw markdown text (can be encrypted)
  timestamp: number;
  index: number;
}

// --- Dexie Database Class ---

class AIContextBridgeDatabase extends Dexie {
  projects!: Table<Project>;
  conversations!: Table<Conversation>;
  messages!: Table<Message>;

  constructor() {
    super('AIContextBridgeDB');
    
    // Define stores and indices
    this.version(1).stores({
      projects: 'id, name, createdAt, updatedAt',
      conversations: 'id, projectId, title, platform, capturedAt, updatedAt',
      messages: 'id, conversationId, role, timestamp, index',
    });
  }
}

export const db = new AIContextBridgeDatabase();

// --- Crypto Key Management (Local-First Extension Helper) ---

/**
 * Retrieves the CryptoKey if encryption is enabled.
 * Uses chrome.storage.local for isolation and persistence.
 */
export async function getActiveCryptoKey(): Promise<CryptoKey | null> {
  if (typeof chrome === 'undefined' || !chrome.storage || !chrome.storage.local) {
    // Fallback for raw browser testing or SSR
    const jwkStr = localStorage.getItem('masterKeyJwk');
    const enabled = localStorage.getItem('encryptionEnabled') === 'true';
    if (!enabled || !jwkStr) return null;
    try {
      return await importKeyFromJWK(JSON.parse(jwkStr));
    } catch {
      return null;
    }
  }

  return new Promise((resolve) => {
    chrome.storage.local.get(['encryptionEnabled', 'masterKeyJwk'], async (res) => {
      if (!res.encryptionEnabled || !res.masterKeyJwk) {
        resolve(null);
      } else {
        try {
          const key = await importKeyFromJWK(res.masterKeyJwk);
          resolve(key);
        } catch (e) {
          console.error('Failed to import master key:', e);
          resolve(null);
        }
      }
    });
  });
}

// --- Transactional Database Helpers ---

// Decrypt conversation title helper
export async function decryptTitle(title: string, key: CryptoKey | null): Promise<string> {
  if (title.startsWith('enc:') && key) {
    try {
      return await decryptText(title.replace('enc:', ''), key);
    } catch (e) {
      return '[Encrypted Title - Locked]';
    }
  }
  return title.replace(/^enc:/, ''); // Strip prefix if unencrypted
}

// Decrypt message content helper
export async function decryptMessageContent(content: string, key: CryptoKey | null): Promise<string> {
  if (content.startsWith('enc:') && key) {
    try {
      return await decryptText(content.replace('enc:', ''), key);
    } catch (e) {
      return '[Decryption failed: master key is missing or invalid]';
    }
  }
  if (content.startsWith('enc:')) {
    return '[Encrypted Message - Toggle encryption and provide key to decrypt]';
  }
  return content;
}

// Encrypt string helper
export async function encryptIfNeeded(text: string, key: CryptoKey | null): Promise<string> {
  if (key) {
    const encrypted = await encryptText(text, key);
    return `enc:${encrypted}`;
  }
  return text;
}

// --- Projects CRUD Operations ---

export async function createProject(name: string, description: string): Promise<string> {
  const id = crypto.randomUUID();
  const now = Date.now();
  await db.projects.add({
    id,
    name,
    description,
    createdAt: now,
    updatedAt: now,
  });
  return id;
}

export async function getProjects(): Promise<Project[]> {
  return await db.projects.orderBy('name').toArray();
}

export async function renameProject(id: string, name: string, description: string): Promise<void> {
  await db.projects.update(id, {
    name,
    description,
    updatedAt: Date.now(),
  });
}

export async function deleteProject(id: string): Promise<void> {
  await db.transaction('rw', [db.projects, db.conversations], async () => {
    // Delete project
    await db.projects.delete(id);
    // Unassign all conversations in this project
    await db.conversations.where('projectId').equals(id).modify({ projectId: null });
  });
}

// --- Conversations & Messages CRUD Operations ---

export async function deleteConversation(id: string): Promise<void> {
  await db.transaction('rw', [db.conversations, db.messages], async () => {
    await db.conversations.delete(id);
    await db.messages.where('conversationId').equals(id).delete();
  });
}

export async function moveConversationToProject(id: string, projectId: string | null): Promise<void> {
  await db.conversations.update(id, { projectId });
}

/**
 * Saves or updates a conversation along with its messages.
 * Automatically handles encryption in a single atomic transaction.
 */
export async function saveCapturedConversation(
  conversationId: string,
  title: string,
  platform: 'chatgpt' | 'claude' | 'gemini' | 'deepseek',
  url: string,
  rawMessages: { role: 'user' | 'assistant'; content: string; timestamp: number }[],
  projectId: string | null = null
): Promise<void> {
  const key = await getActiveCryptoKey();
  const now = Date.now();

  const encryptedTitle = await encryptIfNeeded(title, key);

  await db.transaction('rw', [db.conversations, db.messages], async () => {
    // 1. Check if conversation already exists
    const existing = await db.conversations.get(conversationId);
    
    // Retain existing project link if it exists and projectId is null in capture
    const finalProjectId = projectId !== null ? projectId : (existing ? existing.projectId : null);
    
    const convoData: Conversation = {
      id: conversationId,
      projectId: finalProjectId,
      title: encryptedTitle,
      platform,
      url,
      capturedAt: existing ? existing.capturedAt : now,
      updatedAt: now,
      messageCount: rawMessages.length,
    };

    await db.conversations.put(convoData);

    // 2. Process messages: Encrypt content if needed, and write to table
    // Delete existing messages for this conversation to prevent duplicate ordering
    await db.messages.where('conversationId').equals(conversationId).delete();

    const messagesToSave: Message[] = [];
    for (let i = 0; i < rawMessages.length; i++) {
      const msg = rawMessages[i];
      const encryptedContent = await encryptIfNeeded(msg.content, key);
      messagesToSave.push({
        id: crypto.randomUUID(),
        conversationId,
        role: msg.role,
        content: encryptedContent,
        timestamp: msg.timestamp || now,
        index: i,
      });
    }

    if (messagesToSave.length > 0) {
      await db.messages.bulkAdd(messagesToSave);
    }
  });
}

/**
 * Retrieves a conversation details with transparent decryption.
 */
export async function getConversation(id: string): Promise<(Omit<Conversation, 'title'> & { title: string }) | null> {
  const key = await getActiveCryptoKey();
  const convo = await db.conversations.get(id);
  if (!convo) return null;

  return {
    ...convo,
    title: await decryptTitle(convo.title, key),
  };
}

/**
 * Retrieves messages for a specific conversation with transparent decryption.
 */
export async function getConversationMessages(conversationId: string): Promise<Message[]> {
  const key = await getActiveCryptoKey();
  const rawMsgs = await db.messages
    .where('conversationId')
    .equals(conversationId)
    .sortBy('index');

  const decryptedMsgs: Message[] = [];
  for (const msg of rawMsgs) {
    decryptedMsgs.push({
      ...msg,
      content: await decryptMessageContent(msg.content, key),
    });
  }
  return decryptedMsgs;
}

/**
 * Full in-memory search across projects, platform, dates and deep conversation contents.
 * Resilient to active local encryption!
 */
export interface SearchFilters {
  query: string;
  projectId?: string | null; // filter by project ID, 'unassigned' or all
  platform?: string; // 'all' | 'chatgpt' | 'claude' etc.
  dateRange?: { start: number; end: number } | null;
}

export async function searchConversations(filters: SearchFilters): Promise<{
  conversation: Omit<Conversation, 'title'> & { title: string };
  matchingMessageIndex?: number;
  snippet?: string;
}[]> {
  const key = await getActiveCryptoKey();
  const queryLower = filters.query.trim().toLowerCase();

  // Retrieve base conversations
  let convoCollection = db.conversations.toCollection();

  // Fast database filtering (platform and projectId indices)
  if (filters.platform && filters.platform !== 'all') {
    convoCollection = db.conversations.where('platform').equals(filters.platform);
  }

  let matchedConvos = await convoCollection.toArray();

  // Filter project ID if specified
  if (filters.projectId !== undefined) {
    matchedConvos = matchedConvos.filter(c => c.projectId === filters.projectId);
  }

  // Filter date range if specified
  if (filters.dateRange) {
    const { start, end } = filters.dateRange;
    matchedConvos = matchedConvos.filter(c => c.updatedAt >= start && c.updatedAt <= end);
  }

  const results: {
    conversation: Omit<Conversation, 'title'> & { title: string };
    matchingMessageIndex?: number;
    snippet?: string;
  }[] = [];

  for (const convo of matchedConvos) {
    const decryptedTitle = await decryptTitle(convo.title, key);
    const titleMatch = decryptedTitle.toLowerCase().includes(queryLower);

    // Deep search inside messages
    const messages = await db.messages.where('conversationId').equals(convo.id).toArray();
    let textMatch = false;
    let matchingIndex = -1;
    let snippetText = '';

    for (const msg of messages) {
      const decryptedContent = await decryptMessageContent(msg.content, key);
      const contentLower = decryptedContent.toLowerCase();

      if (queryLower && contentLower.includes(queryLower)) {
        textMatch = true;
        matchingIndex = msg.index;
        
        // Form a context snippet around the search query
        const queryPos = contentLower.indexOf(queryLower);
        const startPos = Math.max(0, queryPos - 40);
        const endPos = Math.min(decryptedContent.length, queryPos + queryLower.length + 60);
        
        snippetText = decryptedContent.slice(startPos, endPos);
        if (startPos > 0) snippetText = '...' + snippetText;
        if (endPos < decryptedContent.length) snippetText = snippetText + '...';
        break; // Match first occurrence
      }
    }

    // Add to results if query is empty (returns everything filtered) or if matching title/text
    if (!queryLower || titleMatch || textMatch) {
      results.push({
        conversation: {
          ...convo,
          title: decryptedTitle,
        },
        matchingMessageIndex: matchingIndex !== -1 ? matchingIndex : undefined,
        snippet: snippetText || undefined,
      });
    }
  }

  // Sort by updatedAt descending (recent first)
  return results.sort((a, b) => b.conversation.updatedAt - a.conversation.updatedAt);
}

/**
 * Migration helper to encrypt/decrypt existing database records.
 * Triggered when encryption is toggled in Settings.
 */
export async function migrateDatabaseEncryption(enable: boolean, newKey: CryptoKey | null): Promise<void> {
  const existingKey = await getActiveCryptoKey();
  
  await db.transaction('rw', [db.conversations, db.messages], async () => {
    // 1. Migrate Conversations
    const convos = await db.conversations.toArray();
    for (const convo of convos) {
      const decryptedTitle = await decryptTitle(convo.title, existingKey);
      const encryptedTitle = enable ? await encryptIfNeeded(decryptedTitle, newKey) : decryptedTitle.replace(/^enc:/, '');
      await db.conversations.update(convo.id, { title: encryptedTitle });
    }

    // 2. Migrate Messages
    const msgs = await db.messages.toArray();
    for (const msg of msgs) {
      const decryptedContent = await decryptMessageContent(msg.content, existingKey);
      const encryptedContent = enable ? await encryptIfNeeded(decryptedContent, newKey) : decryptedContent.replace(/^enc:/, '');
      await db.messages.update(msg.id, { content: encryptedContent });
    }
  });
}
