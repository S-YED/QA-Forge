import http from 'node:http';
import type { AddressInfo } from 'node:net';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

// Behind one proxy (Railway), each visitor must get their own allowance. Before this, the API saw only the
// proxy's address, so every user shared a single bucket.
let server: http.Server;
let base = '';

beforeAll(async () => {
  process.env.TRUST_PROXY_HOPS = '1';
  const { default: app } = await import('../app.js');
  server = http.createServer(app);
  await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));
  base = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
});

afterAll(() => new Promise<void>((resolve) => server.close(() => resolve())));

const hit = (ip: string) => fetch(`${base}/api/health`, { headers: { 'X-Forwarded-For': ip } }).then((r) => r.status);

describe('rate limit behind a proxy', () => {
  it('counts each visitor separately, by the address the proxy reports', async () => {
    // In batches: 300 connections at once overflow the listen backlog on Windows.
    for (let i = 0; i < 300; i += 25) {
      const batch = await Promise.all(Array.from({ length: 25 }, () => hit('203.0.113.7')));
      expect(batch.every((s) => s === 200), `requests ${i + 1} to ${i + 25}`).toBe(true);
    }
    expect(await hit('203.0.113.7')).toBe(429); // this visitor used their minute
    expect(await hit('203.0.113.8')).toBe(200); // another visitor is unaffected
  });

  it('ignores an address the client adds itself (only the last hop is trusted)', async () => {
    // A client behind the proxy sends its own X-Forwarded-For; the proxy appends the real address after it.
    expect(await hit('1.2.3.4, 203.0.113.7')).toBe(429);
  });
});
