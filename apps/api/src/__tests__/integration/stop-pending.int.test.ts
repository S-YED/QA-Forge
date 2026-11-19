/**
 * CR-9: a Stop on a run that is not executing in this process (still pending, or left behind) is closed by the route
 * itself. The run page waits for the live connection to report the end, so the route must say so too; before, the
 * page sat on "Stopping…" until a reload.
 */
import http from 'node:http';
import type { AddressInfo } from 'node:net';
import { io as connect, type Socket } from 'socket.io-client';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import app from '../../app.js';
import { supabase } from '../../config/supabase.js';
import { createSocketServer } from '../../websocket/socket-server.js';
import { windDown } from '../../services/wind-down.js';
import { USERS, signIn } from './helpers.js';

let server: http.Server;
let base: string;
let token: string;
let userId: string;
let projectId: string;
let caseId: string;
let socket: Socket | undefined;

const api = (path: string, method = 'GET', body?: unknown) =>
  fetch(`${base}/api${path}`, { method, headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' }, body: body === undefined ? undefined : JSON.stringify(body) });

beforeAll(async () => {
  server = http.createServer(app);
  app.set('io', createSocketServer(server)); // as index.ts does, so routes can reach the run's room
  await new Promise<void>((r) => server.listen(0, r));
  base = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
  ({ token, id: userId } = await signIn(USERS.bob));
  projectId = ((await (await api('/projects', 'POST', { name: 'cr-9 stop pending', base_url: 'https://example.com/' })).json()) as { project: { id: string } }).project.id;
  const suite = ((await (await api(`/projects/${projectId}/test-suites`, 'POST', { name: 's' })).json()) as { suite: { id: string } }).suite.id;
  caseId = ((await (await api(`/projects/${projectId}/test-suites/${suite}/test-cases`, 'POST', {
    title: 'never started',
    steps: [{ step_number: 1, action: 'assert_visible', instruction: 'Heading', selector: 'h1' }],
  })).json()) as { test_case: { id: string } }).test_case.id;
});

afterAll(async () => {
  socket?.close();
  if (projectId) await api(`/projects/${projectId}`, 'DELETE');
  await new Promise<void>((r) => server.close(() => r()));
});

describe('CR-9 Stop on a run that is not executing', () => {
  it('tells the run page the run has ended', async () => {
    // A pending row nobody is executing, as when Stop beats the executor to it.
    const { data: run } = await supabase
      .from('test_runs')
      .insert({ project_id: projectId, user_id: userId, test_case_id: caseId, mode: 'ai_driven', status: 'pending', browser: 'chromium' })
      .select('id')
      .single();

    socket = connect(base, { auth: { token }, transports: ['websocket'], reconnection: false, forceNew: true });
    await new Promise<void>((resolve, reject) => {
      socket!.once('connect', () => resolve());
      socket!.once('connect_error', reject);
    });
    await socket.timeout(10_000).emitWithAck('test:join', { test_run_id: run!.id });
    const ended = new Promise<{ status: string; error_message: string }>((resolve) => socket!.once('test:complete', resolve));

    expect((await api(`/projects/${projectId}/test-runs/${run!.id}/cancel`, 'POST', {})).status).toBe(202);
    const complete = await Promise.race([ended, new Promise<null>((r) => setTimeout(() => r(null), 5_000))]);
    expect(complete).toMatchObject({ status: 'error', error_message: 'Stopped by you before it finished.' });
  }, 30_000);

  it('CR-14: deleting the project closes a run that is running but not executing here yet', async () => {
    // The G9 window: the executor has claimed the row (running) but is not in flight; it must find the run over.
    const { data: run } = await supabase
      .from('test_runs')
      .insert({ project_id: projectId, user_id: userId, test_case_id: caseId, mode: 'ai_driven', status: 'running', browser: 'chromium' })
      .select('id')
      .single();
    await windDown('project_id', projectId);
    const { data: after } = await supabase.from('test_runs').select('status, error_message').eq('id', run!.id).single();
    expect(after).toEqual({ status: 'error', error_message: 'Stopped by you before it finished.' });
  }, 30_000);
});
