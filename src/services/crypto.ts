/**
 * Browser Web Crypto API Wrapper for AES-GCM 256-bit encryption.
 * Absolutely offline-first, local-only, no cloud communication.
 * Environmental-safe: uses the global crypto variable instead of window.crypto 
 * to ensure seamless support inside background Service Workers.
 */

// Helper to convert ArrayBuffer to Base64
function bufferToBase64(buffer: ArrayBuffer): string {
  const bytes = new Uint8Array(buffer);
  let binary = '';
  for (let i = 0; i < bytes.byteLength; i++) {
    binary += String.fromCharCode(bytes[i]);
  }
  return btoa(binary);
}

// Helper to convert Base64 to ArrayBuffer
function base64ToBuffer(base64: string): ArrayBuffer {
  const binaryString = atob(base64);
  const len = binaryString.length;
  const bytes = new Uint8Array(len);
  for (let i = 0; i < len; i++) {
    bytes[i] = binaryString.charCodeAt(i);
  }
  return bytes.buffer;
}

// Generate a new AES-GCM 256-bit key
export async function generateMasterKey(): Promise<CryptoKey> {
  return await crypto.subtle.generateKey(
    {
      name: 'AES-GCM',
      length: 256,
    },
    true, // extractable
    ['encrypt', 'decrypt']
  );
}

// Export CryptoKey to JWK (JSON Web Key) format for storage
export async function exportKeyToJWK(key: CryptoKey): Promise<JsonWebKey> {
  return await crypto.subtle.exportKey('jwk', key);
}

// Import CryptoKey from JWK format
export async function importKeyFromJWK(jwk: JsonWebKey): Promise<CryptoKey> {
  return await crypto.subtle.importKey(
    'jwk',
    jwk,
    {
      name: 'AES-GCM',
      length: 256,
    },
    true,
    ['encrypt', 'decrypt']
  );
}

// Encrypt text using AES-GCM
export async function encryptText(text: string, key: CryptoKey): Promise<string> {
  try {
    const encoder = new TextEncoder();
    const data = encoder.encode(text);
    
    // 12-byte IV is standard and highly secure for AES-GCM
    const iv = crypto.getRandomValues(new Uint8Array(12));
    
    const encryptedBuffer = await crypto.subtle.encrypt(
      {
        name: 'AES-GCM',
        iv: iv,
      },
      key,
      data
    );
    
    const ivBase64 = bufferToBase64(iv.buffer);
    const encryptedBase64 = bufferToBase64(encryptedBuffer);
    
    // Return composite string: iv_in_base64:ciphertext_in_base64
    return `${ivBase64}:${encryptedBase64}`;
  } catch (err) {
    console.error('Encryption failed:', err);
    throw new Error('Encryption failed: ' + String(err));
  }
}

// Decrypt text using AES-GCM
export async function decryptText(encryptedComposite: string, key: CryptoKey): Promise<string> {
  try {
    const parts = encryptedComposite.split(':');
    if (parts.length !== 2) {
      throw new Error('Invalid encrypted data format');
    }
    
    const ivBuffer = base64ToBuffer(parts[0]);
    const encryptedBuffer = base64ToBuffer(parts[1]);
    
    const decryptedBuffer = await crypto.subtle.decrypt(
      {
        name: 'AES-GCM',
        iv: new Uint8Array(ivBuffer),
      },
      key,
      encryptedBuffer
    );
    
    const decoder = new TextDecoder();
    return decoder.decode(decryptedBuffer);
  } catch (err) {
    console.error('Decryption failed. The key might be invalid or data was altered:', err);
    throw new Error('Decryption failed: ' + String(err));
  }
}
