import { describe, expect, it } from 'vitest';
import { httpUrl } from '../validation.js';

describe('httpUrl (SEC-3)', () => {
  it('accepts only http(s) URLs', () => {
    for (const ok of ['http://localhost:4100/', 'https://example.com/a?b=1']) expect(httpUrl().safeParse(ok).success).toBe(true);
    for (const bad of ['file:///etc/passwd', 'javascript:alert(1)', 'ftp://example.com/', 'not a url']) {
      expect(httpUrl().safeParse(bad).success, bad).toBe(false);
    }
  });
});
