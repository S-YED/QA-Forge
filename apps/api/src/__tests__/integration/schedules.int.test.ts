/**
 * F9 scheduled suite runs: a schedule is saved per suite with its next run time, a due schedule starts
 * exactly one suite run even when two checks race, and a disabled or empty one starts none.
 * Prereq: local Supabase with migrations 26 and 29, and Playwright Chromium.
 */
import http from 'node:http';
import type { AddressInfo } from 'node:net';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { USERS, signIn, useApi } from './helpers.js';
import { supabase } from '../../config/supabase.js';
import { runDueSchedules } from '../../services/schedules.js';

const api = useApi();
const PASS = [{ step_number: 1, action: 'assert_visible', instruction: 'Heading', selector: 'h1' }];
const DAILY = { frequency: 'daily', hour: 9, timezone: 'Asia/Kolkata' };

let target: http.Server;
let token = '';
let projectId = '';

type Schedule = { id: string; suite_id: string; frequency: string; hour: number; weekday: number | null; enabled: boolean; next_run_at: string; last_batch_id: string | null };

const schedules = (suffix = '') => `/projects/${projectId}/schedules${suffix}`;

async function suiteOf(name: string, cases: unknown[][]): Promise<string> {
  const suite = (await (await api(`/projects/${projectId}/test-suites`, token, 'POST', { name })).json()) as { suite: { id: string } };
  for (const [i, steps] of cases.entries()) {
    expect((await api(`/projects/${projectId}/test-suites/${suite.suite.id}/test-cases`, token, 'POST', { title: `case ${i + 1}`, steps })).status).toBe(201);
  }
  return suite.suite.id;
}

/** Make the suite's schedule due a minute ago. */
const makeDue = (suiteId: string) =>
  supabase.from('suite_schedules').update({ next_run_at: new Date(Date.now() - 60_000).toISOString() }).eq('suite_id', suiteId);
const batchesOf = async (suiteId: string) => (await supabase.from('run_batches').select('id').eq('suite_id', suiteId)).data ?? [];
const scheduleOf = async (suiteId: string) => (await supabase.from('suite_schedules').select('*').eq('suite_id', suiteId).single()).data as Schedule;

beforeAll(async () => {
  target = http.createServer((_req, res) => res.writeHead(200, { 'Content-Type': 'text/html' }).end('<!doctype html><title>Fixture</title><h1>Hello fixture</h1>'));
  await new Promise<void>((r) => target.listen(0, '127.0.0.1', r));
  ({ token } = await signIn(USERS.bob));
  const project = (await (
    await api('/projects', token, 'POST', { name: 'f9-schedules', base_url: `http://127.0.0.1:${(target.address() as AddressInfo).port}/` })
  ).json()) as { project: { id: string } };
  projectId = project.project.id;
});

afterAll(async () => {
  // Let the last suite run finish before its project is deleted under it.
  for (let i = 0; i < 100; i++) {
    const { count } = await supabase.from('test_runs').select('id', { count: 'exact', head: true }).eq('project_id', projectId).in('status', ['pending', 'running']);
    if (!count) break;
    await new Promise((r) => setTimeout(r, 300));
  }
  if (projectId) await api(`/projects/${projectId}`, token, 'DELETE');
  await new Promise<void>((r) => target.close(() => r()));
});

describe('F9 schedules: the routes', () => {
  it('saves one schedule per suite with its next run in the future, and replaces it on change', async () => {
    const suiteId = await suiteOf('nightly', [PASS]);
    const saved = await api(schedules(`/${suiteId}`), token, 'PUT', DAILY);
    expect(saved.status).toBe(200);
    const first = ((await saved.json()) as { schedule: Schedule }).schedule;
    expect(first).toMatchObject({ suite_id: suiteId, frequency: 'daily', hour: 9, weekday: null, enabled: true });
    const inMs = new Date(first.next_run_at).getTime() - Date.now();
    expect(inMs).toBeGreaterThan(0);
    expect(inMs).toBeLessThanOrEqual(24 * 3600_000);
    expect(new Date(first.next_run_at).toISOString().slice(14, 19)).toBe('30:00'); // 09:00 in India is hh:30 UTC

    const changed = await api(schedules(`/${suiteId}`), token, 'PUT', { frequency: 'weekly', weekday: 1, hour: 6, timezone: 'UTC', enabled: false });
    expect(((await changed.json()) as { schedule: Schedule }).schedule).toMatchObject({ id: first.id, frequency: 'weekly', weekday: 1, hour: 6, enabled: false });
    const list = ((await (await api(schedules(), token)).json()) as { schedules: Schedule[] }).schedules;
    expect(list.filter((s) => s.suite_id === suiteId)).toHaveLength(1);

    expect((await api(schedules(`/${suiteId}`), token, 'DELETE')).status).toBe(204);
    expect((await api(schedules(`/${suiteId}`), token, 'DELETE')).status).toBe(404);
  });

  it('refuses a weekly schedule with no day, a bad hour, an unknown timezone, and an unknown suite', async () => {
    const suiteId = await suiteOf('validation', [PASS]);
    expect((await api(schedules(`/${suiteId}`), token, 'PUT', { frequency: 'weekly', hour: 9, timezone: 'UTC' })).status).toBe(400);
    expect((await api(schedules(`/${suiteId}`), token, 'PUT', { ...DAILY, hour: 24 })).status).toBe(400);
    expect((await api(schedules(`/${suiteId}`), token, 'PUT', { ...DAILY, timezone: 'Mars/Olympus' })).status).toBe(400);
    expect((await api(schedules('/3f2b8c1e-9d4a-4f6b-8e2a-1c5d7e9f0a3b'), token, 'PUT', DAILY)).status).toBe(404);
  });

  it("another user cannot list, set or remove this project's schedules", async () => {
    const suiteId = await suiteOf('private', [PASS]);
    expect((await api(schedules(`/${suiteId}`), token, 'PUT', DAILY)).status).toBe(200);
    const alice = await signIn(USERS.alice);
    expect((await api(schedules(), alice.token)).status).toBe(404);
    expect((await api(schedules(`/${suiteId}`), alice.token, 'PUT', { ...DAILY, hour: 1 })).status).toBe(404);
    expect((await api(schedules(`/${suiteId}`), alice.token, 'DELETE')).status).toBe(404);
    expect((await scheduleOf(suiteId)).hour).toBe(9);
  });
});

describe('F9 schedules: running what is due', () => {
  it('starts exactly one suite run for a due schedule, even when two checks race, and moves it to the next slot', async () => {
    const suiteId = await suiteOf('due', [PASS, PASS]);
    await api(schedules(`/${suiteId}`), token, 'PUT', DAILY);
    await makeDue(suiteId);

    const [a, b] = await Promise.all([runDueSchedules(undefined), runDueSchedules(undefined)]);
    // At most one of the two checks wins the slot. (A dev API running against the same local database
    // has its own timer and may win it instead; either way exactly one suite run must exist.)
    expect(a + b).toBeLessThanOrEqual(1);
    let batches = await batchesOf(suiteId);
    for (let i = 0; i < 20 && batches.length === 0; i++) {
      await new Promise((r) => setTimeout(r, 250));
      batches = await batchesOf(suiteId);
    }
    expect(batches).toHaveLength(1);

    let after = await scheduleOf(suiteId);
    for (let i = 0; i < 20 && !after.last_batch_id; i++) {
      await new Promise((r) => setTimeout(r, 250));
      after = await scheduleOf(suiteId);
    }
    expect(new Date(after.next_run_at).getTime()).toBeGreaterThan(Date.now());
    expect(after.last_batch_id).toBe(batches[0].id);

    expect(await runDueSchedules(undefined)).toBe(0); // not due again until the next slot
    expect(await batchesOf(suiteId)).toHaveLength(1);

    // And the suite run it started really runs.
    const deadline = Date.now() + 60_000;
    for (;;) {
      const res = (await (await api(`/projects/${projectId}/run-batches/${batches[0].id}`, token)).json()) as { counts: { total: number; passed: number; pending: number; running: number } };
      if (res.counts.pending + res.counts.running === 0) {
        expect(res.counts).toMatchObject({ total: 2, passed: 2 });
        break;
      }
      if (Date.now() > deadline) throw new Error('scheduled suite run did not finish');
      await new Promise((r) => setTimeout(r, 400));
    }
  }, 120_000);

  it('starts nothing for a schedule that is switched off', async () => {
    const suiteId = await suiteOf('off', [PASS]);
    await api(schedules(`/${suiteId}`), token, 'PUT', { ...DAILY, enabled: false });
    await makeDue(suiteId);
    expect(await runDueSchedules(undefined)).toBe(0);
    expect(await batchesOf(suiteId)).toHaveLength(0);
  });

  it('records a suite run that says why when the project has no base URL, instead of skipping it silently (CR-13)', async () => {
    const suiteId = await suiteOf('no address', [PASS, PASS]);
    await api(schedules(`/${suiteId}`), token, 'PUT', DAILY);
    const { data: before } = await supabase.from('projects').select('base_url').eq('id', projectId).single();
    await supabase.from('projects').update({ base_url: null }).eq('id', projectId);
    try {
      await makeDue(suiteId);
      expect(await runDueSchedules(undefined)).toBe(1);
      const [batch] = await batchesOf(suiteId);
      expect(batch).toBeTruthy();
      expect((await scheduleOf(suiteId)).last_batch_id).toBe(batch.id);
      const { data: runs } = await supabase.from('test_runs').select('status, error_message, completed_at').eq('batch_id', batch.id);
      expect(runs).toHaveLength(2);
      for (const run of runs!) {
        expect(run).toMatchObject({ status: 'error', error_message: expect.stringMatching(/base URL/) });
        expect(run.completed_at).toBeTruthy();
      }
    } finally {
      await supabase.from('projects').update({ base_url: before!.base_url }).eq('id', projectId);
    }
  });

  it('skips a suite with no cases but keeps its schedule for the next slot', async () => {
    const suiteId = await suiteOf('empty', []);
    await api(schedules(`/${suiteId}`), token, 'PUT', DAILY);
    await makeDue(suiteId);
    expect(await runDueSchedules(undefined)).toBe(0);
    expect(await batchesOf(suiteId)).toHaveLength(0);
    const after = await scheduleOf(suiteId);
    expect(after.enabled).toBe(true);
    expect(new Date(after.next_run_at).getTime()).toBeGreaterThan(Date.now());
  });
});
