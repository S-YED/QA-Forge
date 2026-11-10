// Runner behaviour against real Chromium and a local fixture site (no network, no Docker).
// Requires: `pnpm --filter @qaforge/playwright-runner exec playwright install chromium`.
import { execFileSync } from 'node:child_process';
import http from 'node:http';
import type { AddressInfo } from 'node:net';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import {
  assertAllowedTarget,
  looksLikeSelector,
  readableError,
  runTest as runUnguarded,
  type RunTestOptions,
  type StepResult,
} from '../src/index.js';

// The fixture lives on 127.0.0.1, which the SSRF guard blocks unless allowed explicitly.
const runTest = (o: RunTestOptions) => runUnguarded({ allowedPrivateHosts: ['127.0.0.1'], ...o });

const PAGES: Record<string, string> = {
  '/': `<!doctype html><title>Home</title>
    <h1 data-testid="title">Hello fixture</h1>
    <input id="name" /><select id="color"><option value="r">Red</option><option value="g">Green</option></select>
    <button id="go" onclick="setTimeout(() => { document.getElementById('out').textContent = 'Saved ' + document.getElementById('name').value }, 200)">Go</button>
    <p id="out"></p><span class="dup">a</span><span class="dup">b</span>
    <a id="next" href="/next">Next</a>`,
  '/next': `<!doctype html><title>Next</title><h1>Next page</h1>`,
  '/form': `<!doctype html><title>Form</title>
    <nav><a href="/next">Sign in</a></nav>
    <h2>Account</h2>
    <label>Email <input id="email"></label>
    <label for="pw">Password</label><input id="pw" type="password">
    <input id="q" placeholder="Search products">
    <label>Country <select id="country"><option value="in">India</option><option value="us">USA</option></select></label>
    <button onclick="setTimeout(() => { const m = document.getElementById('msg'); m.textContent = 'Welcome ' + document.getElementById('email').value; m.hidden = false }, 200)">Sign in</button>
    <p id="msg" hidden></p>
    <button>Delete</button><button>Delete</button>
    <span data-testid="badge">New</span>`,
  '/leak': `<!doctype html><h1>Leak</h1><img src="http://localhost:{PORT}/secret-img">`,
  '/ws': `<!doctype html><p id="ws">open</p><script>
    const s = new WebSocket('ws://localhost:{PORT}/secret-ws');
    s.onclose = s.onerror = () => { document.getElementById('ws').textContent = 'closed' };</script>`,
};
/** host + path of every request the fixture received */
const hits: string[] = [];

/** TCP servers listening in this process: the fixture plus any SSRF-guard proxy still open. */
const listeningServers = () => process.getActiveResourcesInfo().filter((r) => r === 'TCPServerWrap').length;
let listeningAtStart = 0;

/** Browser processes started by this test process and still alive. */
function browserChildren(): string[] {
  if (process.platform === 'win32') {
    const out = execFileSync(
      'powershell',
      ['-NoProfile', '-Command', `Get-CimInstance Win32_Process -Filter "ParentProcessId=${process.pid}" | ForEach-Object { $_.Name }`],
      { encoding: 'utf8' },
    );
    return out.split(/\r?\n/).filter((n) => /chrom|headless/i.test(n));
  }
  const out = execFileSync('ps', ['-A', '-o', 'ppid=,comm='], { encoding: 'utf8' });
  return out
    .split('\n')
    .map((l) => l.trim().split(/\s+/))
    .filter(([ppid, comm]) => Number(ppid) === process.pid && /chrom|headless/i.test(comm ?? ''))
    .map(([, comm]) => comm);
}

let server: http.Server;
let baseUrl: string;

beforeAll(async () => {
  server = http.createServer((req, res) => {
    hits.push(`${req.headers.host} ${req.url}`);
    const port = (server.address() as AddressInfo).port;
    if (req.url === '/hop') return void res.writeHead(302, { Location: `http://localhost:${port}/next` }).end();
    const body = PAGES[req.url ?? '']?.replaceAll('{PORT}', String(port));
    res.writeHead(body ? 200 : 404, { 'Content-Type': 'text/html' }).end(body ?? 'not found');
  });
  server.on('upgrade', (req, socket) => {
    hits.push(`${req.headers.host} ${req.url}`);
    socket.destroy();
  });
  await new Promise<void>((r) => server.listen(0, '127.0.0.1', r));
  baseUrl = `http://127.0.0.1:${(server.address() as AddressInfo).port}/`;
  listeningAtStart = listeningServers(); // before any browser or guard proxy exists
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
    expect(result.steps[0].error_message).toMatch(/Refusing to open file: URL/);
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

describe('SSRF guard', () => {
  it('classifies targets by resolved address', async () => {
    for (const url of [
      'http://127.0.0.1/', 'http://10.1.2.3/', 'http://172.20.0.1/', 'http://192.168.1.1/', 'http://100.64.0.1/',
      'http://169.254.169.254/latest/meta-data/', 'http://0.0.0.0/', 'http://2130706433/', 'http://0x7f.1/',
      'http://[::1]/', 'http://[::ffff:127.0.0.1]/', 'http://[fd00::1]/', 'http://[fe80::1]/', 'http://localhost:4100/',
      'file:///etc/passwd', 'ftp://example.com/',
    ]) {
      await expect(assertAllowedTarget(url), url).rejects.toThrow(/Refusing to open/);
    }
    for (const url of ['http://8.8.8.8/', 'https://1.1.1.1/x', 'http://[2606:4700:4700::1111]/']) {
      await expect(assertAllowedTarget(url), url).resolves.toBeUndefined();
    }
    await expect(assertAllowedTarget('http://localhost:4100/', ['localhost'])).resolves.toBeUndefined();
    await expect(assertAllowedTarget('http://10.0.0.5/', ['*'])).resolves.toBeUndefined();
    await expect(assertAllowedTarget('file:///etc/passwd', ['*'])).rejects.toThrow(/file:/);
  });

  it('refuses a private base URL unless that host is allowed', async () => {
    const result = await runUnguarded({ baseUrl, steps: [s(1, 'assert_visible', { selector: 'h1' })] });
    expect(result.status).toBe('error');
    expect(result.error_message).toMatch(/Base URL not allowed: Refusing to open 127\.0\.0\.1.*private/);
  });

  it('blocks subresources, websockets, redirects and navigation to other private hosts', async () => {
    hits.length = 0;
    const page = await runTest({
      baseUrl,
      steps: [
        s(1, 'navigate', { value: '/leak' }),
        s(2, 'assert_visible', { selector: 'h1' }),
        s(3, 'navigate', { value: '/ws' }),
        s(4, 'assert_text', { selector: '#ws', value: 'closed' }),
      ],
    });
    expect(page.error_message).toBeUndefined();
    expect(page.status).toBe('passed');

    const redirect = await runTest({ baseUrl, stepTimeoutMs: 2_000, steps: [s(1, 'navigate', { value: '/hop' })] });
    expect(redirect.status).toBe('failed');
    expect(redirect.steps[0].error_message).toMatch(/^Blocked: Refusing to open localhost: .*private/);

    const direct = await runTest({ baseUrl, steps: [s(1, 'navigate', { value: baseUrl.replace('127.0.0.1', 'localhost') + 'next' })] });
    expect(direct.status).toBe('failed');
    expect(direct.steps[0].error_message).toMatch(/^Refusing to open localhost: .*private/);

    expect(hits.some((h) => h.includes('/hop'))).toBe(true); // the guard let the allowed hop through...
    expect(hits.filter((h) => h.startsWith('localhost'))).toEqual([]); // ...but nothing reached the other host
  }, 60_000);
});

describe('targets in plain words', () => {
  it('finds fields by label or placeholder, buttons by their text, and checks by visible text or test id', async () => {
    const result = await runTest({
      baseUrl,
      steps: [
        s(1, 'navigate', { value: '/form' }),
        s(2, 'assert_visible', { selector: 'Account' }),
        s(3, 'fill', { selector: 'Email', value: 'ada@example.com' }),
        s(4, 'fill', { selector: 'Password', value: 's3cret' }),
        s(5, 'fill', { selector: 'Search products', value: 'shoes' }),
        s(6, 'select', { selector: 'Country', value: 'us' }),
        s(7, 'click', { selector: '"Sign in"' }),
        s(8, 'assert_visible', { selector: 'Welcome ada@example.com' }),
        s(9, 'assert_text', { selector: 'Welcome', value: 'ada@example.com' }),
        s(10, 'assert_visible', { selector: 'badge' }),
        // a check only needs something matching to be shown, even when several match
        s(11, 'assert_visible', { selector: 'Delete' }),
        // the "Sign in" button was clicked, not the "Sign in" link: we are still on /form
        s(12, 'assert_url', { value: '/form' }),
      ],
    });
    expect(result.error_message).toBeUndefined();
    expect(result.steps.map((r) => r.status)).toEqual(Array(12).fill('passed'));
  }, 60_000);

  it('says plainly when nothing matches', async () => {
    const result = await runTest({
      baseUrl,
      stepTimeoutMs: 1_000,
      steps: [s(1, 'navigate', { value: '/form' }), s(2, 'click', { selector: 'Log out' })],
    });
    expect(result.status).toBe('failed');
    expect(result.steps[1].error_message).toBe('Couldn\'t find a button, link or control called "Log out" on /form');
  }, 30_000);

  it('refuses to guess when several elements match', async () => {
    const started = Date.now();
    const result = await runTest({ baseUrl, steps: [s(1, 'navigate', { value: '/form' }), s(2, 'click', { selector: 'Delete' })] });
    expect(result.steps[1].error_message).toBe('2 elements match "Delete" on /form; add more words or use a selector');
    expect(Date.now() - started).toBeLessThan(10_000); // fails early, not after the 15 s step timeout
  }, 30_000);

  it('keeps the readable part of a Playwright error', () => {
    const err = new Error('locator.click: Timeout 500ms exceeded.\nCall log:\n  - waiting for locator(\'#x\')');
    expect(readableError(err)).toBe('locator.click: Timeout 500ms exceeded.');
    expect(readableError(new Error('browserType.launch: closed Browser logs: <launching> chrome.exe --flags'))).toBe('browserType.launch: closed');
  });

  it('tells selectors from plain words', () => {
    for (const sel of ['#go', '.dup', '[data-testid="x"]', '//button', 'button[type=submit]', 'input#email', 'div > a', 'li:nth-child(2)', 'text=Go', 'role=button[name="Go"]', 'css=button']) {
      expect(looksLikeSelector(sel), sel).toBe(true);
    }
    for (const words of ['Sign in', 'Email', 'Continue to payment', 'login-submit', 'Order #123', '"Sign in"', 'button']) {
      expect(looksLikeSelector(words), words).toBe(false);
    }
  });
});

// Runs after every test above: passed, failed, timed out, unreachable, refused, persistence error and cancelled runs.
describe('cleanup', () => {
  it('leaves no browser process or guard proxy behind', () => {
    expect(browserChildren()).toEqual([]);
    expect(listeningServers()).toBe(listeningAtStart);
  });
});
