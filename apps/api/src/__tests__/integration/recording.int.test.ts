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
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';
import app from '../../app.js';
import { supabase } from '../../config/supabase.js';
import { createSocketServer } from '../../websocket/socket-server.js';
import { recordingLimits } from '../../websocket/handlers/recording.handler.js';
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

  it('keeps a value typed just before Stop even when saving an action is slow', async () => {
    const loginUrl = `${demoUrl}/login`;
    const created = await api(`/projects/${projectId}/recorded-sessions`, alice.token, 'POST', { name: 'stop rec', base_url: loginUrl });
    const sessionId = ((await created.json()) as { recorded_session: { id: string } }).recorded_session.id;
    const at = await centres(loginUrl, ['login-email']);

    // Each action takes 800 ms to save, longer than Stop's wait for the focused field's blur; Stop must still wait.
    const realFrom = supabase.from.bind(supabase);
    const slowSaves = vi.spyOn(supabase, 'from').mockImplementation(((table: string) => {
      const builder = realFrom(table);
      if (table !== 'session_actions') return builder;
      const insert = builder.insert.bind(builder) as (...a: unknown[]) => { select: () => { single: () => PromiseLike<unknown> } };
      return Object.assign(builder, {
        insert: (...args: unknown[]) => {
          const query = insert(...args).select().single();
          const delayed = {
            select: () => delayed,
            single: () => delayed,
            then: (ok: (v: unknown) => unknown, fail: (e: unknown) => unknown) =>
              new Promise((r) => setTimeout(r, 800)).then(() => query).then(ok, fail),
          };
          return delayed;
        },
      });
    }) as typeof supabase.from);

    const s = open(alice.token);
    const events: string[] = [];
    s.on('recording:action:captured', (d: { action: { action_type: string } }) => events.push(`captured ${d.action.action_type}`));
    try {
      await next(s, 'connect');
      s.emit('recording:join', { session_id: sessionId });
      const started = next(s, 'recording:started');
      s.emit('recording:start', { session_id: sessionId });
      await started;
      s.emit('recording:input', { session_id: sessionId, kind: 'click', ...at['login-email'] });
      s.emit('recording:input', { session_id: sessionId, kind: 'type', text: 'demo@qaforge.dev' });
      const done = next(s, 'recording:completed').then(() => events.push('completed'));
      s.emit('recording:stop', { session_id: sessionId }); // the field is still focused: Stop blurs it
      await done;
    } finally {
      slowSaves.mockRestore();
      s.close();
    }

    expect(events).toEqual(['captured type', 'completed']);
    const saved = (await (await api(`/projects/${projectId}/recorded-sessions/${sessionId}`, alice.token)).json()) as {
      recorded_session: { status: string };
      actions: { action_type: string; value: string; timestamp_ms: number }[];
    };
    expect(saved.recorded_session.status).toBe('completed');
    expect(saved.actions.map((a) => [a.action_type, a.value])).toEqual([['type', 'demo@qaforge.dev']]);
    expect(saved.actions[0].timestamp_ms).toBeGreaterThan(0);
  }, 60_000);

  it('closes a recording left without Stop once it has been idle', async () => {
    const created = await api(`/projects/${projectId}/recorded-sessions`, alice.token, 'POST', { name: 'idle rec', base_url: `${demoUrl}/login` });
    const sessionId = ((await created.json()) as { recorded_session: { id: string } }).recorded_session.id;
    const s = open(alice.token);
    recordingLimits.idleMs = 1_500;
    try {
      await next(s, 'connect');
      s.emit('recording:join', { session_id: sessionId });
      const started = next(s, 'recording:started');
      s.emit('recording:start', { session_id: sessionId });
      await started;
      await next(s, 'recording:completed', 15_000); // nobody pressed Stop
    } finally {
      recordingLimits.idleMs = 15 * 60_000;
      s.close();
    }
    const saved = (await (await api(`/projects/${projectId}/recorded-sessions/${sessionId}`, alice.token)).json()) as {
      recorded_session: { status: string };
    };
    expect(saved.recorded_session.status).toBe('completed');
  }, 60_000);

  it('lets a reloaded page or reconnected socket watch the running recording', async () => {
    const created = await api(`/projects/${projectId}/recorded-sessions`, alice.token, 'POST', { name: 'reload rec', base_url: `${demoUrl}/login` });
    const sessionId = ((await created.json()) as { recorded_session: { id: string } }).recorded_session.id;
    const first = open(alice.token);
    const again = open(alice.token);
    try {
      await Promise.all([next(first, 'connect'), next(again, 'connect')]);
      const started = next(first, 'recording:started');
      first.emit('recording:start', { session_id: sessionId });
      await started;

      // The page asks to start again, as it does on every connect: it gets the running browser, not an error.
      const errors: string[] = [];
      again.on('recording:error', (d: { message: string }) => errors.push(d.message));
      const watching = Promise.all([next(again, 'recording:started'), next(again, 'recording:frame')]);
      again.emit('recording:join', { session_id: sessionId });
      again.emit('recording:start', { session_id: sessionId });
      await watching;
      expect(errors).toEqual([]);

      const done = next(again, 'recording:completed');
      again.emit('recording:stop', { session_id: sessionId });
      await done;
    } finally {
      first.close();
      again.close();
    }
  }, 60_000);

  it('Stop ends a recording whose browser is gone, e.g. after an API restart', async () => {
    const created = await api(`/projects/${projectId}/recorded-sessions`, alice.token, 'POST', { name: 'orphan rec', base_url: `${demoUrl}/login` });
    const sessionId = ((await created.json()) as { recorded_session: { id: string } }).recorded_session.id;
    const s = open(alice.token);
    try {
      await next(s, 'connect');
      const done = next(s, 'recording:completed');
      s.emit('recording:stop', { session_id: sessionId }); // no browser was ever started in this process
      await done;
    } finally {
      s.close();
    }
    const saved = (await (await api(`/projects/${projectId}/recorded-sessions/${sessionId}`, alice.token)).json()) as {
      recorded_session: { status: string };
    };
    expect(saved.recorded_session.status).toBe('completed');
  }, 60_000);

  it('records and replays in Chromium only, even a session saved as Firefox before', async () => {
    const firefox = await api(`/projects/${projectId}/recorded-sessions`, alice.token, 'POST', { name: 'ff', base_url: `${demoUrl}/login`, browser: 'firefox' });
    expect(firefox.status).toBe(400);

    const created = await api(`/projects/${projectId}/recorded-sessions`, alice.token, 'POST', { name: 'older ff', base_url: `${demoUrl}/login` });
    const sessionId = ((await created.json()) as { recorded_session: { id: string } }).recorded_session.id;
    // what the database holds for a session created when the dialog still offered Firefox
    await supabase.from('recorded_sessions').update({ browser: 'firefox', status: 'completed' }).eq('id', sessionId);
    await supabase.from('session_actions').insert({ session_id: sessionId, action_number: 1, action_type: 'click', selector: 'Log in', url: `${demoUrl}/login`, timestamp_ms: 10, metadata: {} });

    const replay = await api(`/projects/${projectId}/recorded-sessions/${sessionId}/replay`, alice.token, 'POST', {});
    expect(replay.status).toBe(201);
    expect(((await replay.json()) as { test_run: { browser: string } }).test_run.browser).toBe('chromium');
  }, 60_000);

  it('replaying a recording again reuses its test case instead of adding a copy (G8)', async () => {
    const created = await api(`/projects/${projectId}/recorded-sessions`, alice.token, 'POST', { name: 'replayed twice', base_url: `${demoUrl}/login` });
    const sessionId = ((await created.json()) as { recorded_session: { id: string } }).recorded_session.id;
    await supabase.from('recorded_sessions').update({ status: 'completed' }).eq('id', sessionId);
    await supabase.from('session_actions').insert({ session_id: sessionId, action_number: 1, action_type: 'click', selector: 'Log in', url: `${demoUrl}/login`, timestamp_ms: 10, metadata: {} });

    const replay = async () =>
      ((await (await api(`/projects/${projectId}/recorded-sessions/${sessionId}/replay`, alice.token, 'POST', {})).json()) as {
        test_case: { id: string };
        test_run: { test_case_id: string };
      });
    const first = await replay();
    const second = await replay();
    expect(second.test_case.id).toBe(first.test_case.id);
    expect(second.test_run.test_case_id).toBe(first.test_case.id);
    const { count } = await supabase
      .from('test_cases')
      .select('id', { count: 'exact', head: true })
      .eq('description', `Automated compile of recorded session ${sessionId}`);
    expect(count).toBe(1);
  }, 60_000);

  it('the owner deletes a recording with its actions; nobody else can', async () => {
    const created = await api(`/projects/${projectId}/recorded-sessions`, alice.token, 'POST', { name: 'to delete', base_url: `${demoUrl}/login` });
    const sessionId = ((await created.json()) as { recorded_session: { id: string } }).recorded_session.id;
    await supabase.from('session_actions').insert({ session_id: sessionId, action_number: 1, action_type: 'click', selector: 'Log in', url: `${demoUrl}/login`, timestamp_ms: 10, metadata: {} });

    const bobsProject = await api('/projects', bob.token, 'POST', { name: 'not hers either' });
    const bobsProjectId = ((await bobsProject.json()) as { project: { id: string } }).project.id;
    const byBob = await api(`/projects/${bobsProjectId}/recorded-sessions/${sessionId}`, bob.token, 'DELETE');
    await api(`/projects/${bobsProjectId}`, bob.token, 'DELETE');
    expect(byBob.status).toBe(404);

    expect((await api(`/projects/${projectId}/recorded-sessions/${sessionId}`, alice.token, 'DELETE')).status).toBe(204);
    expect((await api(`/projects/${projectId}/recorded-sessions/${sessionId}`, alice.token)).status).toBe(404);
    const { count } = await supabase.from('session_actions').select('id', { count: 'exact', head: true }).eq('session_id', sessionId);
    expect(count).toBe(0);
  }, 60_000);

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

      // Nor can he end her recording, over the socket or through his own project's route.
      const refused = next<{ message: string }>(his, 'recording:error');
      his.emit('recording:stop', { session_id: sessionId });
      expect((await refused).message).toMatch(/unauthorized/i);
      const bobsProject = await api('/projects', bob.token, 'POST', { name: 'not hers', base_url: `${demoUrl}/` });
      const bobsProjectId = ((await bobsProject.json()) as { project: { id: string } }).project.id;
      const viaRoute = await api(`/projects/${bobsProjectId}/recorded-sessions/${sessionId}/complete`, bob.token, 'POST', {});
      await api(`/projects/${bobsProjectId}`, bob.token, 'DELETE');
      expect(viaRoute.status).toBe(404);
      const stillLive = next(hers, 'recording:frame');
      hers.emit('recording:input', { session_id: sessionId, kind: 'scroll', dy: 100 });
      await stillLive; // her browser is still open and answering

      const done = next(hers, 'recording:completed');
      hers.emit('recording:stop', { session_id: sessionId });
      await done;
    } finally {
      hers.close();
      his.close();
    }
  }, 60_000);
});
