/**
 * QA-2 cross-user matrix against real local Supabase: bob (a regular tester) tries every
 * project-scoped route on alice's resources, plus live-run sockets. Each attempt must be
 * refused (403/404, never data) and leave alice's data unchanged.
 */
import http from 'node:http';
import type { AddressInfo } from 'node:net';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { io as connect, type Socket } from 'socket.io-client';
import app from '../../app.js';
import { createSocketServer } from '../../websocket/socket-server.js';
import { USERS, signIn } from './helpers.js';

let server: http.Server;
let base = '';
const api = (path: string, token: string, method = 'GET', body?: unknown) =>
  fetch(`${base}/api${path}`, {
    method,
    headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
const json = async <T>(res: Response) => (await res.json()) as T;
const keyIds = async (token: string) => (await json<{ keys: { id: string; provider: string }[] }>(await api('/api-keys', token))).keys;

let alice: { token: string; id: string };
let bob: { token: string; id: string };
const a = { project: '', suite: '', caseId: '', run: '', bug: '', session: '', key: '' };

beforeAll(async () => {
  server = http.createServer(app);
  createSocketServer(server);
  await new Promise<void>((resolve) => server.listen(0, resolve));
  base = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;

  alice = await signIn(USERS.alice);
  bob = await signIn(USERS.bob);
  const t = alice.token;
  // 127.0.0.1 is allowlisted in vitest.integration.config.ts; nothing listens on :1, so the run ends quickly as error.
  a.project = (await json<{ project: { id: string } }>(await api('/projects', t, 'POST', { name: 'qa2-alice', base_url: 'http://127.0.0.1:1/' }))).project.id;
  const p = `/projects/${a.project}`;
  a.suite = (await json<{ suite: { id: string } }>(await api(`${p}/test-suites`, t, 'POST', { name: 'qa2' }))).suite.id;
  a.caseId = (
    await json<{ test_case: { id: string } }>(
      await api(`${p}/test-suites/${a.suite}/test-cases`, t, 'POST', {
        title: 'alice case',
        steps: [{ step_number: 1, action: 'navigate', instruction: 'Open', value: '/' }],
      }),
    )
  ).test_case.id;
  a.run = (await json<{ test_run: { id: string } }>(await api(`${p}/test-runs`, t, 'POST', { test_case_id: a.caseId, mode: 'ai_driven' }))).test_run.id;
  a.bug = (await json<{ bug: { id: string } }>(await api(`${p}/bugs`, t, 'POST', { title: 'alice bug' }))).bug.id;
  a.session = (await json<{ recorded_session: { id: string } }>(await api(`${p}/recorded-sessions`, t, 'POST', { name: 'alice rec', base_url: 'http://127.0.0.1:1/' }))).recorded_session.id;

  // A throwaway AI key for a provider alice has no key for (never touch a real one).
  const have = new Set((await keyIds(t)).map((k) => k.provider));
  const provider = ['gemini', 'anthropic', 'openai', 'openrouter'].find((x) => !have.has(x));
  if (provider) {
    const created = await json<{ key: { id: string } }>(await api('/api-keys', t, 'POST', { provider, key: 'qa2-throwaway-key-not-real' }));
    a.key = created.key.id;
  }
  expect(Object.entries(a).filter(([k, v]) => k !== 'key' && !v)).toEqual([]); // every fixture was created
});

afterAll(async () => {
  if (a.key) await api(`/api-keys/${a.key}`, alice.token, 'DELETE');
  if (a.project) await api(`/projects/${a.project}`, alice.token, 'DELETE');
  await new Promise<void>((resolve) => server.close(() => resolve()));
});

const refused = (status: number) => expect([403, 404]).toContain(status);

describe("QA-2 bob cannot reach alice's resources through the API", () => {
  it('refuses every read, list, write and delete', async () => {
    const p = `/projects/${a.project}`;
    const c = `${p}/test-suites/${a.suite}/test-cases`;
    const attempts: [string, string, unknown?][] = [
      ['GET', p],
      ['PUT', p, { name: 'pwned' }],
      ['GET', `${p}/test-suites`],
      ['GET', `${p}/test-suites/${a.suite}`],
      ['POST', `${p}/test-suites`, { name: 'bob suite' }],
      ['PUT', `${p}/test-suites/${a.suite}`, { name: 'pwned' }],
      ['GET', c],
      ['GET', `${c}/${a.caseId}`],
      ['POST', c, { title: 'bob case', steps: [{ step_number: 1, action: 'navigate', instruction: 'Open', value: '/' }] }],
      ['PUT', `${c}/${a.caseId}`, { title: 'pwned' }],
      ['GET', `${p}/test-runs`],
      ['GET', `${p}/test-runs/${a.run}`],
      ['POST', `${p}/test-runs`, { test_case_id: a.caseId, mode: 'ai_driven' }],
      ['GET', `${p}/bugs`],
      ['GET', `${p}/bugs/${a.bug}`],
      ['POST', `${p}/bugs`, { title: 'bob bug' }],
      ['PUT', `${p}/bugs/${a.bug}`, { status: 'closed' }],
      ['GET', `${p}/recorded-sessions`],
      ['GET', `${p}/recorded-sessions/${a.session}`],
      ['POST', `${p}/recorded-sessions/${a.session}/complete`, {}],
      ['POST', `${p}/recorded-sessions/${a.session}/replay`, {}],
      // Valid bodies, so a refusal comes from the ownership check and not from validation.
      ['POST', `${p}/ai/generate`, { prompt: 'Test the login page with valid credentials' }],
      ['POST', `${p}/ai/approve`, { suite_id: a.suite, ai_generated: false, test_cases: [{ title: 'bob draft', steps: [{ step_number: 1, action: 'navigate', instruction: 'Open', value: '/' }] }] }],
      ['POST', `${p}/ai/optimize/${a.caseId}`, {}],
      ['DELETE', `${c}/${a.caseId}`],
      ['DELETE', `${p}/test-suites/${a.suite}`],
      ['DELETE', p],
    ];
    const allowed: string[] = [];
    for (const [method, path, body] of attempts) {
      const res = await api(path, bob.token, method, body);
      if (![403, 404].includes(res.status)) allowed.push(`${method} ${path.replace(a.project, ':alice')} -> ${res.status}`);
    }
    expect(allowed).toEqual([]);

    // Nothing of alice's changed.
    const t = alice.token;
    expect((await json<{ project: { name: string } }>(await api(p, t))).project.name).toBe('qa2-alice');
    expect((await api(`${p}/test-suites/${a.suite}`, t)).status).toBe(200);
    expect((await json<{ test_case: { title: string } }>(await api(`${c}/${a.caseId}`, t))).test_case.title).toBe('alice case');
    expect((await json<{ bug: { status: string } }>(await api(`${p}/bugs/${a.bug}`, t))).bug.status).toBe('open');
    expect((await json<{ test_runs: unknown[] }>(await api(`${p}/test-runs`, t))).test_runs).toHaveLength(1);
  });

  it("refuses alice's AI key", async () => {
    expect(a.key, 'alice already has a key for every provider; no throwaway key to test with').not.toBe('');
    refused((await api(`/api-keys/${a.key}`, bob.token, 'PUT', { key: 'bob-overwrites-this' })).status);
    refused((await api(`/api-keys/${a.key}/validate`, bob.token, 'POST')).status);
    refused((await api(`/api-keys/${a.key}`, bob.token, 'DELETE')).status);
    expect((await keyIds(bob.token)).map((k) => k.id)).not.toContain(a.key);
    expect((await keyIds(alice.token)).map((k) => k.id)).toContain(a.key);
  });
});

describe('QA-2 live run sockets', () => {
  // Listeners are attached at open: two sockets connect concurrently, so attaching later can miss the event.
  const open = (token?: string) => {
    const s: Socket = connect(base, { auth: token ? { token } : {}, transports: ['websocket'], reconnection: false, forceNew: true });
    const outcome = new Promise<string>((resolve) => {
      s.once('connect', () => resolve('connected'));
      s.once('connect_error', (e) => resolve(`refused: ${e.message}`));
    });
    return { s, outcome };
  };
  const join = async (c: ReturnType<typeof open>, test_run_id: string) => {
    expect(await c.outcome).toBe('connected');
    return (await c.s.timeout(10_000).emitWithAck('test:join', { test_run_id })) as { ok: boolean };
  };

  it('refuses a connection without a token or with a forged one', async () => {
    const none = open();
    const forged = open('not-a-real-jwt');
    try {
      expect(await none.outcome).toBe('refused: UNAUTHORIZED');
      expect(await forged.outcome).toBe('refused: UNAUTHORIZED');
    } finally {
      none.s.close();
      forged.s.close();
    }
  });

  it("lets alice join her run and refuses bob's join", async () => {
    const hers = open(alice.token);
    const his = open(bob.token);
    try {
      expect(await join(hers, a.run)).toEqual({ ok: true });
      expect(await join(his, a.run)).toEqual({ ok: false });
    } finally {
      hers.s.close();
      his.s.close();
    }
  });
});
