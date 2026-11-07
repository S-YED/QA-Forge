// Stored AI keys: AES-256-GCM round trip, fresh IV per value, tampering detected, no plaintext leaks.
import { describe, expect, it } from 'vitest';
import { EncryptionError, decrypt, encrypt } from '../encryption.js';

const SAMPLE = 'sk-sample-not-a-real-key-1234567890';

describe('encryption', () => {
  it('round-trips and never contains the plaintext', () => {
    const sealed = encrypt(SAMPLE);
    expect(sealed).toMatch(/^[0-9a-f]{24}:[0-9a-f]{32}:[0-9a-f]+$/);
    expect(sealed).not.toContain(SAMPLE);
    expect(decrypt(sealed)).toBe(SAMPLE);
  });

  it('uses a fresh IV, so equal keys encrypt differently', () => {
    expect(encrypt(SAMPLE)).not.toBe(encrypt(SAMPLE));
  });

  it('rejects tampered or malformed values without leaking crypto details', () => {
    const [iv, tag, data] = encrypt(SAMPLE).split(':');
    const flipped = (data[0] === '0' ? '1' : '0') + data.slice(1);
    expect(() => decrypt(`${iv}:${tag}:${flipped}`)).toThrow(EncryptionError);
    expect(() => decrypt(`${iv}:${tag}:${flipped}`)).toThrow('Decryption failed');
    expect(() => decrypt('not-encrypted')).toThrow('Malformed encrypted value');
  });
});
