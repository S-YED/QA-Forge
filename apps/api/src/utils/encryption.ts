import crypto from 'node:crypto';
import { env } from '../config/env.js';

// ── Error ──────────────────────────────────────────────────────────────────────

export class EncryptionError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'EncryptionError';
  }
}

// ── Helpers ────────────────────────────────────────────────────────────────────

function getKeyBuffer(): Buffer {
  return Buffer.from(env.ENCRYPTION_KEY, 'hex');
}

// ── encrypt ────────────────────────────────────────────────────────────────────

/**
 * Encrypt a plaintext string using AES-256-GCM.
 *
 * Returns a colon-separated string: `iv_hex:authTag_hex:ciphertext_hex`.
 * The result is self-contained — decryption requires only this string and
 * the ENCRYPTION_KEY from the environment.
 */
export function encrypt(plaintext: string): string {
  const keyBuffer = getKeyBuffer();
  const iv = crypto.randomBytes(12); // 96-bit IV is recommended for GCM

  const cipher = crypto.createCipheriv('aes-256-gcm', keyBuffer, iv);

  const encrypted = Buffer.concat([
    cipher.update(plaintext, 'utf8'),
    cipher.final(),
  ]);

  const authTag = cipher.getAuthTag(); // Must be called after final()

  return [
    iv.toString('hex'),
    authTag.toString('hex'),
    encrypted.toString('hex'),
  ].join(':');
}

// ── decrypt ────────────────────────────────────────────────────────────────────

/**
 * Decrypt a value previously produced by `encrypt()`.
 *
 * Throws `EncryptionError` on failure — the raw crypto error is never
 * propagated to callers so internal implementation details stay hidden.
 */
export function decrypt(encrypted: string): string {
  try {
    const [ivHex, authTagHex, ciphertextHex] = encrypted.split(':');

    if (!ivHex || !authTagHex || !ciphertextHex) {
      throw new EncryptionError('Malformed encrypted value');
    }

    const keyBuffer = getKeyBuffer();
    const iv = Buffer.from(ivHex, 'hex');
    const authTag = Buffer.from(authTagHex, 'hex');
    const ciphertext = Buffer.from(ciphertextHex, 'hex');

    const decipher = crypto.createDecipheriv('aes-256-gcm', keyBuffer, iv);

    // authTag MUST be set before the first update() call in GCM mode
    decipher.setAuthTag(authTag);

    const decrypted = Buffer.concat([
      decipher.update(ciphertext),
      decipher.final(),
    ]);

    return decrypted.toString('utf8');
  } catch (err) {
    if (err instanceof EncryptionError) throw err;
    throw new EncryptionError('Decryption failed — invalid key or corrupted data');
  }
}
