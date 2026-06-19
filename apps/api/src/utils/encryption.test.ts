import { describe, it, expect } from 'vitest';
import { encrypt, decrypt, EncryptionError } from './encryption.js';

// AES-256-GCM key encryption used to protect per-user AI provider API keys at rest.
// Uses the ENCRYPTION_KEY loaded from apps/api/.env via dotenv (see config/env.ts).

describe('encryption (AES-256-GCM)', () => {
  const original = 'sk-test-secretkey1234567890abcdef';

  it('round-trips plaintext through encrypt → decrypt', () => {
    const ciphertext = encrypt(original);
    expect(decrypt(ciphertext)).toBe(original);
  });

  it('never returns plaintext and uses the iv:tag:ciphertext format', () => {
    const ciphertext = encrypt(original);
    expect(ciphertext).not.toBe(original);
    expect(ciphertext.split(':')).toHaveLength(3);
  });

  it('uses a random IV — the same plaintext encrypts to different ciphertext', () => {
    expect(encrypt(original)).not.toBe(encrypt(original));
  });

  it('rejects tampered ciphertext (GCM auth tag is verified)', () => {
    const parts = encrypt(original).split(':');
    parts[2] = parts[2].slice(0, -2) + 'ff'; // corrupt the last ciphertext byte
    expect(() => decrypt(parts.join(':'))).toThrow(EncryptionError);
  });

  it('rejects malformed input rather than leaking a raw crypto error', () => {
    expect(() => decrypt('not-a-valid-encrypted-value')).toThrow(EncryptionError);
  });
});
