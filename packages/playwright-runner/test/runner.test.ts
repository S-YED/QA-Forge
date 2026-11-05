// Runner behaviour against real Chromium and a local fixture site (no network, no Docker).
// Requires: `pnpm --filter @qaforge/playwright-runner exec playwright install chromium`.
import http from 'node:http';
import type { AddressInfo } from 'node:net';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { runTest, type StepResult } from '../src/index.js';

const PAGES: Record<string, string> = {
  '/': `<!doctype html><title>Home</title>
    <h1 data-testid="title">Hello fixture</h1>
    <input id="name" /><select id="color"><option value="r">Red</option><option value="g">Green</option></select>
    <button id="go" onclick="setTimeout(() => { document.getElementById('out').textContent = 'Saved ' + document.getElementById('name').value }, 200)">Go</button>
    <p id="out"></p><span class="dup">a</span><span class="dup">b</span>
    <a id="next" href="/next">Next</a>`,
  '/next': `<!doctype html><title>Next</title><h1>Next page</h1>`,
};

let server: http.Server;
let baseUrl: string;

beforeAll(async () => {
  server = http.createServer((req, res) => {
    const body = PAGES[req.url ?? ''];
    res.writeHead(body ? 200 : 404, { 'Content-Type': 'text/html' }).end(body ?? 'not found');
  });
  await new Promise<void>((r) => server.listen(0, '127.0.0.1', r));
  baseUrl = `http://127.0.0.1:${(server.address() as AddressInfo).port}/`;
});
afterAll(() => new Promise<void>((r) => server.close(() => r())));

const s = (n: number, action: string, extra: Record<string, string> = {}) => ({
  step_number: n,
  action,
  instruction: `${action} ${extra.selector ?? extra.value ?? ''}`.trim(),
  ...extra,
});

describe('runTest', () => {
  it('passes a flow using every action and awaits callbacks in order', async () => {
    const events: string[] = [];
    const screenshots: number[] = [];
    const result = await runTest({
      baseUrl,
      steps: [
        s(1, 'assert_visible', { selector: '[data-testid="title"]' }),
        s(2, 'fill', { selector: '#name', value: 'Ada' }),
        s(3, 'select', { selector: '#color', value: 'g' }),
        s(4, 'hover', { selector: '#go' }),
        s(5, 'click', { selector: '#go' }),
        s(6, 'assert_text', { selector: '#out', value: 'Saved Ada' }),
        s(7, 'press', { selector: '#name', value: 'End' }),
        s(8, 'scroll', {}),
        s(9, 'wait_for', { selector: '#next' }),
        s(10, 'click', { selector: '#next' }),
        s(11, 'assert_url', { value: '/next' }),
        s(12, 'navigate', { value: '/' }),
        s(13, 'assert_text', { selector: 'h1', value: 'Hello' }),
      ],
      onStepStart: (n) => void events.push(`start ${n}`),
      onStepComplete: async (r: StepResult) => {
        await new Promise((res) => setTimeout(res, 20)); // slow persistence must still finish before the next step
        events.push(`done ${r.step_number}`);
      },
      onScreenshot: (n) => void screenshots.push(n),
    });

    expect(result.error_message).toBeUndefined();
    expect(result.status).toBe('passed');
    expect(result.passed).toBe(true);
    expect(result.steps.map((r) => r.status)).toEqual(Array(13).fill('passed'));
    expect(events.slice(0, 4)).toEqual(['start 1', 'done 1', 'start 2', 'done 2']);
    expect(screenshots).toHaveLength(13);
  }, 60_000);

  it('never passes an empty step list', async () => {
    const result = await runTest({ baseUrl, steps: [] });
    expect(result.status).toBe('error');
    expect(result.passed).toBe(false);
  });

  it('rejects legacy or unknown-action steps before launching a browser', async () => {
    const legacy = await runTest({ baseUrl, steps: [{ step_number: 1, instruction: 'Click the login button' }] });
    expect(legacy.status).toBe('error');
    expect(legacy.error_message).toMatch(/steps\.0\.action/);

    const unknown = await runTest({ baseUrl, steps: [s(1, 'double_click', { selector: '#go' })] });
    expect(unknown.status).toBe('error');
    expect(unknown.steps).toHaveLength(0);
  });

  it('reports an unreachable base URL as error, not passed', async () => {
    const result = await runTest({ baseUrl: 'http://127.0.0.1:1/', steps: [s(1, 'assert_visible', { selector: 'h1' })] });
    expect(result.status).toBe('error');
    expect(result.error_message).toMatch(/Could not open base URL/);
    expect(result.steps).toHaveLength(0);
  }, 30_000);

  it('fails on a wrong assertion and skips the remaining steps', async () => {
    const result = await runTest({
      baseUrl,
      stepTimeoutMs: 1_000,
      steps: [
        s(1, 'assert_text', { selector: 'h1', value: 'Goodbye' }),
        s(2, 'click', { selector: '#go' }),
      ],
    });
    expect(result.status).toBe('failed');
    expect(result.steps.map((r) => r.status)).toEqual(['failed', 'skipped']);
    expect(result.steps[0].error_message).toMatch(/to contain "Goodbye"/);
    expect(result.steps[0].screenshot_buffer).toBeDefined();
  }, 30_000);

  it('times out a missing element instead of hanging', async () => {
    const started = Date.now();
    const result = await runTest({ baseUrl, stepTimeoutMs: 500, steps: [s(1, 'click', { selector: '#does-not-exist' })] });
    expect(result.status).toBe('failed');
    expect(result.steps[0].error_message).toMatch(/Timeout/i);
    expect(Date.now() - started).toBeLessThan(15_000);
  }, 30_000);

  it('fails an ambiguous selector instead of clicking the wrong element', async () => {
    const result = await runTest({ baseUrl, stepTimeoutMs: 1_000, steps: [s(1, 'click', { selector: '.dup' })] });
    expect(result.status).toBe('failed');
    expect(result.steps[0].error_message).toMatch(/strict mode/i);
  }, 30_000);

  it('refuses non-http navigation', async () => {
    const result = await runTest({ baseUrl, steps: [s(1, 'navigate', { value: 'file:///etc/passwd' })] });
    expect(result.status).toBe('failed');
    expect(result.steps[0].error_message).toMatch(/Refusing to navigate to file:/);
  }, 30_000);

  it('ends with error when persistence (a callback) throws', async () => {
    const result = await runTest({
      baseUrl,
      steps: [s(1, 'assert_visible', { selector: 'h1' }), s(2, 'assert_visible', { selector: 'h1' })],
      onStepComplete: () => {
        throw new Error('db write failed');
      },
    });
    expect(result.status).toBe('error');
    expect(result.error_message).toBe('db write failed');
  }, 30_000);

  it('ends with error when cancelled mid-run', async () => {
    const controller = new AbortController();
    const result = await runTest({
      baseUrl,
      signal: controller.signal,
      steps: [s(1, 'assert_visible', { selector: 'h1' }), s(2, 'wait_for', { selector: '#never' })],
      onStepComplete: (r) => {
        if (r.step_number === 1) setTimeout(() => controller.abort(), 200);
      },
    });
    expect(result.status).toBe('error');
    expect(result.error_message).toBe('Run cancelled');
  }, 30_000);
});
