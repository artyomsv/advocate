import { describe, expect, it } from 'vitest';
import { decrypt, encrypt } from './cipher.js';

const masterKey = 'a'.repeat(64);

describe('credential cipher', () => {
  it('encrypts and decrypts round-trip', () => {
    const plaintext = 'super-secret-password-123';
    const encrypted = encrypt(plaintext, masterKey);
    const decrypted = decrypt(encrypted, masterKey);
    expect(decrypted).toBe(plaintext);
  });

  it('produces different ciphertext each call (random IV)', () => {
    const plaintext = 'the-same-value';
    const a = encrypt(plaintext, masterKey);
    const b = encrypt(plaintext, masterKey);
    expect(a).not.toBe(b);
  });

  it('fails to decrypt with wrong key', () => {
    const encrypted = encrypt('secret', masterKey);
    const wrongKey = 'b'.repeat(64);
    expect(() => decrypt(encrypted, wrongKey)).toThrow();
  });

  it('fails to decrypt tampered ciphertext (auth tag mismatch)', () => {
    const encrypted = encrypt('secret', masterKey);
    // Flip one character in the ciphertext payload
    const tampered = `${encrypted.slice(0, -4)}XXXX`;
    expect(() => decrypt(tampered, masterKey)).toThrow();
  });

  it('rejects master key of wrong length', () => {
    expect(() => encrypt('x', 'short')).toThrow();
  });

  it('rejects master key of correct length but non-hex characters', () => {
    expect(() => encrypt('x', 'z'.repeat(64))).toThrow(/hex-encoded/);
  });

  it('rejects payload too short to contain IV + auth tag', () => {
    // 5 bytes base64-encoded: far below the 28-byte IV+authTag minimum.
    const tooShort = Buffer.from('short').toString('base64');
    expect(() => decrypt(tooShort, masterKey)).toThrow(/too short/);
  });

  it('handles empty plaintext', () => {
    const encrypted = encrypt('', masterKey);
    const decrypted = decrypt(encrypted, masterKey);
    expect(decrypted).toBe('');
  });
});
