import { createCipheriv, createDecipheriv, randomBytes } from 'node:crypto';

const ALGORITHM = 'aes-256-gcm';
const IV_LENGTH = 12; // 96 bits — recommended for GCM
const AUTH_TAG_LENGTH = 16;
const KEY_LENGTH_HEX = 64; // 32 bytes in hex
const HEX_PATTERN = /^[0-9a-fA-F]+$/;

function deriveKey(masterKeyHex: string): Buffer {
  if (masterKeyHex.length !== KEY_LENGTH_HEX) {
    throw new Error(`Master key must be ${KEY_LENGTH_HEX} hex characters (32 bytes)`);
  }
  if (!HEX_PATTERN.test(masterKeyHex)) {
    // Defense-in-depth: env validation should reject this earlier, but a cipher
    // primitive accepting non-hex input would silently produce a truncated Buffer
    // and an opaque "Invalid key length" from OpenSSL instead of an actionable error.
    throw new Error('Master key must be hex-encoded');
  }
  return Buffer.from(masterKeyHex, 'hex');
}

/**
 * Encrypt plaintext with AES-256-GCM.
 * Returns a base64-encoded string containing: IV (12) || authTag (16) || ciphertext
 */
export function encrypt(plaintext: string, masterKeyHex: string): string {
  const key = deriveKey(masterKeyHex);
  const iv = randomBytes(IV_LENGTH);
  const cipher = createCipheriv(ALGORITHM, key, iv);
  const ciphertext = Buffer.concat([cipher.update(plaintext, 'utf8'), cipher.final()]);
  const authTag = cipher.getAuthTag();
  return Buffer.concat([iv, authTag, ciphertext]).toString('base64');
}

/**
 * Decrypt a base64-encoded payload produced by `encrypt`.
 * Throws if the master key is wrong or the ciphertext was tampered with.
 */
export function decrypt(payloadBase64: string, masterKeyHex: string): string {
  const key = deriveKey(masterKeyHex);
  const buffer = Buffer.from(payloadBase64, 'base64');

  if (buffer.length < IV_LENGTH + AUTH_TAG_LENGTH) {
    throw new Error('Ciphertext payload is too short');
  }

  const iv = buffer.subarray(0, IV_LENGTH);
  const authTag = buffer.subarray(IV_LENGTH, IV_LENGTH + AUTH_TAG_LENGTH);
  const ciphertext = buffer.subarray(IV_LENGTH + AUTH_TAG_LENGTH);

  const decipher = createDecipheriv(ALGORITHM, key, iv);
  decipher.setAuthTag(authTag);

  const plaintext = Buffer.concat([decipher.update(ciphertext), decipher.final()]);
  return plaintext.toString('utf8');
}
