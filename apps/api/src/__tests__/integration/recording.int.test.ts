/**
 * A4: recording through the workbench viewport. A socket client drives the recording browser the way the UI does
 * (clicks at viewport coordinates, typed text, keys); the recorded actions must name elements in plain words and
 * replay as a passing run.
 */
import { spawn, type ChildProcess } from 'node:child_process';
import http from 'node:http';
import type { AddressInfo } from 'node:net';
import { fileURLToPath } from 'node:url';
import { chromium } from 'playwright';
import { io as connect, type Socket } from 'socket.io-client';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import app from '../../app.js';
import { createSocketServer } from '../../websocket/socket-server.js';
import { USERS, signIn } from './helpers.js';

let server: http.Server;
let base = '';
let demo: ChildProcess;
let demoUrl = '';
let alice: { token: string; id: string };
let bob: { token: string; id: string };
let projectId = '';
const api = (path: string, token: string, method = 'GET', body?: unknown) =>
  fetch(`${base}/api${path}`, {
    method,
    headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
    body: body === undefined ? undefined : JSON.stringify(body),
  });

beforeAll(async () => {
  server = http.createServer(app);
  createSocketServer(server);
  await new Promise<void>((resolve) => server.listen(0, resolve));
  base = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
  const demoServer = fileURLToPath(new URL('../../../../demo-app/server.mjs', import.meta.url));
  demo = spawn(process.execPath, [demoServer], { env: { ...process.env, PORT: '0' } });
  demoUrl = await new Promise<string>((resolve, reject) => {
    demo.once('error', reject);
    demo.stdout!.on('data', (c: Buffer) => {
      const url = /listening on (http:\/\/\S+)/.exec(c.toString())?.[1];
      if (url) resolve(url);
    });
  });
  alice = await signIn(USERS.alice);
  bob = await signIn(USERS.bob);
  const res = await api('/projects', alice.token, 'POST', { name: 'recording-int', base_url: `${demoUrl}/` });
  projectId = ((await res.json()) as { project: { id: string } }).project.id;
}, 60_000);

afterAll(async () => {
  if (projectId) await api(`/projects/${projectId}`, alice.token, 'DELETE');
  demo?.kill();
  await new Promise<void>((resolve) => server.close(() => resolve()));
});

/** Centre of each element on the demo login page at the recorder's 1280x720 viewport (same page, same layout). */
async function centres(url: string, testIds: string[]) {
  const browser = await chromium.launch();
  try {
    const page = await browser.newPage({ viewport: { width: 1280, height: 720 } });
    await page.goto(url);
    const out: Record<string, { x: number; y: number }> = {};
    for (const id of testIds) {
      const box = (await page.getByTestId(id).boundingBox())!;
      out[id] = { x: Math.round(box.x + box.width / 2), y: Math.round(box.y + box.height / 2) };
    }
    return out;
  } finally {
    await browser.close();
  }
}

const open = (token: string) =>
  connect(base, { auth: { token }, transports: ['websocket'], reconnection: false, forceNew: true });
const next = <T>(s: Socket, event: string, ms = 30_000) =>
  new Promise<T>((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error(`no ${event}`)), ms);
    s.once(event, (data: T) => {
      clearTimeout(timer);
      resolve(data);
    });
  });

describe('A4 recording from the workbench viewport', () => {
  it('turns clicks and typing into plain-word steps that replay green', async () => {
    const loginUrl = `${demoUrl}/login`;
    const created = await api(`/projects/${projectId}/recorded-sessions`, alice.token, 'POST', { name: 'login rec', base_url: loginUrl });
    const sessionId = ((await created.json()) as { recorded_session: { id: string } }).recorded_session.id;
    const at = await centres(loginUrl, ['login-email', 'login-password', 'login-submit']);

    const s = open(alice.token);
    const captured: { action_type: string; selector: string; value: string | null }[] = [];
    s.on('recording:action:captured', (d: { action: (typeof captured)[number] }) => captured.push(d.action));
    try {
      await next(s, 'connect');
      s.emit('recording:join', { session_id: sessionId });
      const started = next(s, 'recording:started');
      s.emit('recording:start', { session_id: sessionId });
      await started;

      const frame = next<{ mime?: string }>(s, 'recording:frame');
      s.emit('recording:input', { session_id: sessionId, kind: 'click', ...at['login-email'] });
      expect((await frame).mime).toBe('image/jpeg'); // a fresh frame follows every input
      s.emit('recording:input', { session_id: sessionId, kind: 'type', text: 'demo@qaforge.dev' });
      s.emit('recording:input', { session_id: sessionId, kind: 'click', ...at['login-password'] });
      s.emit('recording:input', { session_id: sessionId, kind: 'type', text: 'Demo1234!' });
      s.emit('recording:input', { session_id: sessionId, kind: 'click', ...at['login-submit'] });
      // wait until the click on "Log in" was recorded (fields are recorded when they lose focus)
      const deadline = Date.now() + 20_000;
      while (!captured.some((a) => a.action_type === 'click') && Date.now() < deadline) await new Promise((r) => setTimeout(r, 200));

      const done = next(s, 'recording:completed');
      s.emit('recording:stop', { session_id: sessionId });
      await done;
    } finally {
      s.close();
    }

    expect(captured.map((a) => [a.action_type, a.selector, a.value])).toEqual([
      ['type', 'Email', 'demo@qaforge.dev'],
      ['type', 'Password', 'Demo1234!'],
      ['click', 'Log in', null],
    ]);

    const replay = await api(`/projects/${projectId}/recorded-sessions/${sessionId}/replay`, alice.token, 'POST', {});
    expect(replay.status).toBe(201);
    const runId = ((await replay.json()) as { test_run: { id: string } }).test_run.id;
    const until = Date.now() + 60_000;
    let status = 'pending';
    let steps: { instruction: string; status: string }[] = [];
    while (['pending', 'running'].includes(status) && Date.now() < until) {
      await new Promise((r) => setTimeout(r, 500));
      const d = (await (await api(`/projects/${projectId}/test-runs/${runId}`, alice.token)).json()) as {
        test_run: { status: string };
        steps: { instruction: string; status: string }[];
      };
      status = d.test_run.status;
      steps = d.steps;
    }
    expect(status).toBe('passed');
    expect(steps.map((st) => st.instruction)).toEqual([
      `Open ${loginUrl}`,
      'Type "demo@qaforge.dev" into "Email"',
      'Type "Demo1234!" into "Password"',
      'Click "Log in"',
    ]);
  }, 120_000);

  it('ignores input for a session the socket does not own', async () => {
    const created = await api(`/projects/${projectId}/recorded-sessions`, alice.token, 'POST', { name: 'owned', base_url: `${demoUrl}/login` });
    const sessionId = ((await created.json()) as { recorded_session: { id: string } }).recorded_session.id;
    const hers = open(alice.token);
    const his = open(bob.token);
    try {
      await Promise.all([next(hers, 'connect'), next(his, 'connect')]);
      const started = next(hers, 'recording:started');
      hers.emit('recording:start', { session_id: sessionId });
      await started;
      await new Promise((r) => setTimeout(r, 1_500)); // let the session's own startup frames arrive first
      let frames = 0;
      hers.on('recording:frame', () => frames++);
      his.emit('recording:input', { session_id: sessionId, kind: 'click', x: 10, y: 10 });
      await new Promise((r) => setTimeout(r, 1_500));
      expect(frames).toBe(0); // bob's click did nothing: no frame, no action
      const done = next(hers, 'recording:completed');
      hers.emit('recording:stop', { session_id: sessionId });
      await done;
    } finally {
      hers.close();
      his.close();
    }
  }, 60_000);
});
