// AI-3 + DEMO-1: the local demo cases are valid, route by prompt, and actually run against
// apps/demo-app in real Chromium (needs `playwright install chromium`; no Docker, no AI key).
import { spawn, type ChildProcess } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { LOCAL_DEMO_PROVIDER, localDemoTestCases } from '@qaforge/ai-engine';
import { runTest } from '@qaforge/playwright-runner';

describe('local demo cases', () => {
  it('route by prompt words and fall back to every case', () => {
    const all = localDemoTestCases('something unrelated');
    expect(all.length).toBe(12);
    expect(all.every((c) => c.tags.includes(LOCAL_DEMO_PROVIDER))).toBe(true);
    expect(localDemoTestCases('Test the login page').map((c) => c.title)).toEqual([
      'Log in with the demo account',
      'Wrong password shows an error',
      'Login requires an email',
      'Dashboard sends signed-out visitors to login',
    ]);
    expect(localDemoTestCases('checkout with a coupon').every((c) => c.tags.includes('checkout'))).toBe(true);
  });
});

describe('local demo cases against apps/demo-app', () => {
  let app: ChildProcess;
  let baseUrl: string;

  beforeAll(async () => {
    const server = fileURLToPath(new URL('../../../demo-app/server.mjs', import.meta.url));
    app = spawn(process.execPath, [server], { env: { ...process.env, PORT: '0' } });
    baseUrl = await new Promise<string>((resolve, reject) => {
      app.once('error', reject);
      app.stdout!.on('data', (chunk: Buffer) => {
        const url = /listening on (http:\/\/\S+)/.exec(chunk.toString())?.[1];
        if (url) resolve(`${url}/`);
      });
    });
  });
  afterAll(() => {
    app?.kill();
  });

  it('serves 404 and 500 pages with the right status', async () => {
    expect((await fetch(`${baseUrl}no-such-page`)).status).toBe(404);
    expect((await fetch(`${baseUrl}500`)).status).toBe(500);
    expect((await fetch(`${baseUrl}..%2fserver.mjs`)).status).toBe(404);
  });

  it('every case passes except the planted coupon bug, which fails on the total', async () => {
    const outcomes: Record<string, unknown> = {};
    let couponError: string | undefined;
    for (const testCase of localDemoTestCases('')) {
      const result = await runTest({ baseUrl, steps: testCase.steps, allowedPrivateHosts: ['127.0.0.1'], stepTimeoutMs: 5_000 });
      outcomes[testCase.title] = result.status === 'passed' ? 'passed' : `${result.status}: ${result.error_message}`;
      if (testCase.tags.includes('known-bug')) couponError = result.steps.find((s) => s.status === 'failed')?.error_message;
    }
    const expected: Record<string, unknown> = Object.fromEntries(Object.keys(outcomes).map((t) => [t, 'passed']));
    expected['Coupon SAVE10 takes 10% off the total'] = expect.stringMatching(/^failed: Step 14 failed/);
    expect(outcomes).toEqual(expected);
    expect(couponError).toMatch(/to contain "\$108\.00" but got "\$120\.00"/);
  }, 180_000);
});
