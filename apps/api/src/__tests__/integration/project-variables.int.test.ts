/**
 * F4 project variables and secrets: the routes never give a secret back, a step's {{NAME}} is filled in
 * for the run, and the secret value appears nowhere it is stored or sent (step rows, run, bug, live events).
 * Prereq: local Supabase with migration 27 and Playwright Chromium. The target is a fixture page here.
 */
import http from 'node:http';
import type { AddressInfo } from 'node:net';
import { io as connect } from 'socket.io-client';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import app from '../../app.js';
import { supabase } from '../../config/supabase.js';
import { createSocketServer } from '../../websocket/socket-server.js';
import { USERS, signIn } from './helpers.js';

// A page that echoes what was typed, so a failed check quotes the typed value in its error.
const FIXTURE = `<!doctype html><title>Fixture</title><h1>Hello fixture</h1>
  <input id="name" /><button id="go" onclick="document.getElementById('out').textContent='Hi '+document.getElementById('name').value">Go</button>
  <p id="out"></p>`;

const SECRET = 'S3cr3t-Value-91x';
const EMAIL = 'ada@example.com';

let server: http.Server;
let target: http.Server;
let base = '';
let token = '';
let projectId = '';
let casesPath = '';

const api = (path: string, auth: string, method = 'GET', body?: unknown) =>
  fetch(`${base}/api${path}`, {
    method,
    headers: { Authorization: `Bearer ${auth}`, 'Content-Type': 'application/json' },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
const vars = (suffix = '') => `/projects/${projectId}/variables${suffix}`;

beforeAll(async () => {
  server = http.createServer(app);
  app.set('io', createSocketServer(server)); // as index.ts does, so runs emit live events
  await new Promise<void>((r) => server.listen(0, '127.0.0.1', r));
  base = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
  target = http.createServer((_req, res) => res.writeHead(200, { 'Content-Type': 'text/html' }).end(FIXTURE));
  await new Promise<void>((r) => target.listen(0, '127.0.0.1', r));

  ({ token } = await signIn(USERS.bob));
  const project = (await (
    await api('/projects', token, 'POST', { name: 'f4-variables', base_url: `http://127.0.0.1:${(target.address() as AddressInfo).port}/` })
  ).json()) as { project: { id: string } };
  projectId = project.project.id;
  const suite = (await (await api(`/projects/${projectId}/test-suites`, token, 'POST', { name: 'vars' })).json()) as { suite: { id: string } };
  casesPath = `/projects/${projectId}/test-suites/${suite.suite.id}/test-cases`;
}, 60_000);

afterAll(async () => {
  if (projectId) await api(`/projects/${projectId}`, token, 'DELETE');
  app.set('io', undefined);
  await new Promise<void>((r) => target.close(() => r()));
  await new Promise<void>((r) => server.close(() => r()));
});

type Variable = { id: string; name: string; is_secret: boolean; value: string | null };
type RunDetail = {
  test_run: { id: string; status: string; error_message: string | null };
  steps: { step_number: number; selector: string | null; value: string | null; status: string; error_message: string | null }[];
  bugs: { id: string }[];
};

/** Start a run of these steps while watching its live events; returns the saved run and everything that was sent. */
async function runWatched(steps: unknown[]): Promise<{ detail: RunDetail; events: string }> {
  const created = await api(casesPath, token, 'POST', { title: `case ${Date.now()}`, steps });
  expect(created.status).toBe(201);
  const caseId = ((await created.json()) as { test_case: { id: string } }).test_case.id;

  const socket = connect(base, { auth: { token }, transports: ['websocket'], reconnection: false, forceNew: true });
  const events: unknown[] = [];
  socket.onAny((name, data) => events.push([name, data]));
  try {
    await new Promise<void>((resolve, reject) => {
      socket.once('connect', () => resolve());
      socket.once('connect_error', reject);
    });
    const started = await api(`/projects/${projectId}/test-runs`, token, 'POST', { test_case_id: caseId, mode: 'ai_driven' });
    const runId = ((await started.json()) as { test_run: { id: string } }).test_run.id;
    await socket.timeout(10_000).emitWithAck('test:join', { test_run_id: runId });

    const deadline = Date.now() + 60_000;
    for (;;) {
      const detail = (await (await api(`/projects/${projectId}/test-runs/${runId}`, token)).json()) as RunDetail;
      if (!['pending', 'running'].includes(detail.test_run.status)) {
        await new Promise((r) => setTimeout(r, 300)); // let the last events arrive
        return { detail, events: JSON.stringify(events) };
      }
      if (Date.now() > deadline) throw new Error('run did not finish');
      await new Promise((r) => setTimeout(r, 300));
    }
  } finally {
    socket.close();
  }
}

describe('F4 variables: the routes', () => {
  it('saves a secret without ever giving it back, and a plain variable with its value', async () => {
    const secret = await api(vars(), token, 'POST', { name: 'PASSWORD', value: SECRET });
    expect(secret.status).toBe(201);
    const saved = ((await secret.json()) as { variable: Variable }).variable;
    expect(saved).toMatchObject({ name: 'PASSWORD', is_secret: true, value: null });

    const plain = await api(vars(), token, 'POST', { name: 'EMAIL', value: EMAIL, is_secret: false });
    expect(((await plain.json()) as { variable: Variable }).variable).toMatchObject({ name: 'EMAIL', is_secret: false, value: EMAIL });

    const listed = await (await api(vars(), token)).text();
    expect(listed).not.toContain(SECRET);
    expect(JSON.parse(listed).variables.map((v: Variable) => [v.name, v.value])).toEqual([
      ['EMAIL', EMAIL],
      ['PASSWORD', null],
    ]);

    // Stored encrypted, not as typed.
    const { data: row } = await supabase.from('project_variables').select('value_encrypted').eq('id', saved.id).single();
    expect(row!.value_encrypted).not.toContain(SECRET);
  });

  it('refuses bad names, duplicates, and revealing a saved secret', async () => {
    expect((await api(vars(), token, 'POST', { name: 'lower case', value: 'x' })).status).toBe(400);
    expect((await api(vars(), token, 'POST', { name: 'EMPTY', value: '' })).status).toBe(400);
    expect((await api(vars(), token, 'POST', { name: 'PASSWORD', value: 'again' })).status).toBe(409);

    const list = ((await (await api(vars(), token)).json()) as { variables: Variable[] }).variables;
    const password = list.find((v) => v.name === 'PASSWORD')!;
    // Switching "secret" off must not expose the stored value: it needs a new one.
    expect((await api(vars(`/${password.id}`), token, 'PUT', { is_secret: false })).status).toBe(400);
    const renamed = await api(vars(`/${password.id}`), token, 'PUT', { name: 'ADMIN_PASSWORD' });
    expect(((await renamed.json()) as { variable: Variable }).variable).toMatchObject({ name: 'ADMIN_PASSWORD', value: null });
    expect((await api(vars(`/${password.id}`), token, 'PUT', { name: 'PASSWORD' })).status).toBe(200);
  });

  it("another user cannot list, add, change or delete this project's variables", async () => {
    const alice = await signIn(USERS.alice);
    const list = ((await (await api(vars(), token)).json()) as { variables: Variable[] }).variables;
    const id = list[0].id;
    expect((await api(vars(), alice.token)).status).toBe(404);
    expect((await api(vars(), alice.token, 'POST', { name: 'HERS', value: 'x' })).status).toBe(404);
    expect((await api(vars(`/${id}`), alice.token, 'PUT', { value: 'pwned' })).status).toBe(404);
    expect((await api(vars(`/${id}`), alice.token, 'DELETE')).status).toBe(404);
    expect(((await (await api(vars(), token)).json()) as { variables: Variable[] }).variables).toHaveLength(2);
  });
});

describe('F4 variables: in a run', () => {
  it('fills {{NAME}} in for the browser, and keeps the name in what is saved', async () => {
    const { detail } = await runWatched([
      { step_number: 1, action: 'fill', instruction: 'Type the password', selector: '#name', value: '{{PASSWORD}}' },
      { step_number: 2, action: 'click', instruction: 'Go', selector: '#go' },
      { step_number: 3, action: 'assert_text', instruction: 'Greets with it', selector: '#out', value: 'Hi {{PASSWORD}}' },
    ]);
    expect(detail.test_run.status).toBe('passed'); // the page really received the secret value
    expect(detail.steps.map((s) => s.value)).toEqual(['{{PASSWORD}}', null, 'Hi {{PASSWORD}}']);
  }, 90_000);

  it('never stores or sends the secret, even when an error quotes it', async () => {
    const { detail, events } = await runWatched([
      // The secret also goes into the page address, which the failure evidence (F7) records.
      { step_number: 1, action: 'navigate', instruction: 'Open with a token', value: '/?token={{PASSWORD}}' },
      { step_number: 2, action: 'fill', instruction: 'Type the password', selector: '#name', value: '{{PASSWORD}}' },
      { step_number: 3, action: 'click', instruction: 'Go', selector: '#go' },
      // Wrong on purpose: the error message quotes both the expected text and what the page shows.
      { step_number: 4, action: 'assert_text', instruction: 'Says goodbye', selector: '#out', value: 'Bye {{PASSWORD}} {{EMAIL}}' },
    ]);
    expect(detail.test_run.status).toBe('failed');
    const failed = detail.steps[3];
    const evidence = (failed as unknown as { metadata: { diagnostics?: { url: string } } }).metadata.diagnostics;
    expect(evidence?.url).toMatch(/\/\?token=••••$/); // recorded, with the secret masked
    expect(failed.error_message).toContain('••••'); // the error did quote it, and it was masked
    expect(failed.error_message).toContain(EMAIL); // a plain variable stays readable
    expect(detail.bugs).toHaveLength(1);

    const runId = detail.test_run.id;
    const [steps, run, bugs] = await Promise.all([
      supabase.from('test_steps').select('*').eq('test_run_id', runId),
      supabase.from('test_runs').select('*').eq('id', runId),
      supabase.from('bugs').select('*').eq('test_run_id', runId),
    ]);
    const stored = JSON.stringify([steps.data, run.data, bugs.data]);
    expect(stored).toContain('••••');
    expect(stored).not.toContain(SECRET);
    expect(JSON.stringify(detail)).not.toContain(SECRET);
    expect(events).toContain('test:step:complete'); // live events were really captured
    expect(events).not.toContain(SECRET);
  }, 90_000);

  it('does not start when a step names a variable the project does not have', async () => {
    const { detail } = await runWatched([
      { step_number: 1, action: 'fill', instruction: 'Type the token', selector: '#name', value: '{{API_TOKEN}}' },
    ]);
    expect(detail.test_run.status).toBe('error');
    expect(detail.test_run.error_message).toBe('Variable API_TOKEN not set for this project. Add it under Variables on the project page.');
    expect(detail.steps).toEqual([]);
    expect(detail.bugs).toEqual([]);
  }, 60_000);
});
