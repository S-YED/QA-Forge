/**
 * F3 run a whole suite: POST /run-batches queues one run per case, runs them in order without the
 * "too many concurrent runs" refusal, reports progress, and can be stopped as a whole.
 * Prereq: local Supabase with migration 26 and Playwright Chromium. The target is a fixture page here.
 */
import http from 'node:http';
import type { AddressInfo } from 'node:net';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { USERS, signIn, useApi } from './helpers.js';
import { supabase } from '../../config/supabase.js';

const api = useApi();

const FIXTURE = `<!doctype html><title>Fixture</title><h1>Hello fixture</h1>`;
const PASS = [{ step_number: 1, action: 'assert_visible', instruction: 'Heading', selector: 'h1' }];
const SLOW = [
  { step_number: 1, action: 'assert_visible', instruction: 'Heading', selector: 'h1' },
  { step_number: 2, action: 'wait_for', instruction: 'Never appears', selector: '#never' },
];

let target: http.Server;
let token: string;
let projectId: string;

type Batch = {
  batch: { id: string; suite_id: string; test_suites: { name: string } | null };
  runs: { id: string; status: string; error_message: string | null; test_case_id: string; test_cases: { title: string } | null }[];
  counts: { total: number; pending: number; running: number; passed: number; failed: number; error: number };
};

beforeAll(async () => {
  target = http.createServer((_req, res) => res.writeHead(200, { 'Content-Type': 'text/html' }).end(FIXTURE));
  await new Promise<void>((r) => target.listen(0, '127.0.0.1', r));
  const targetUrl = `http://127.0.0.1:${(target.address() as AddressInfo).port}/`;
  ({ token } = await signIn(USERS.bob));
  const project = (await (await api('/projects', token, 'POST', { name: 'f3-batches', base_url: targetUrl })).json()) as {
    project: { id: string };
  };
  projectId = project.project.id;
});

afterAll(async () => {
  if (projectId) await api(`/projects/${projectId}`, token, 'DELETE');
  await new Promise<void>((r) => target.close(() => r()));
});

/** A suite (inside `parent` when given) with one case per entry, created in order and titled `<prefix> 1`, `<prefix> 2`... */
async function suiteOf(name: string, cases: unknown[][], { parent, prefix = 'case' }: { parent?: string; prefix?: string } = {}): Promise<string> {
  const suite = (await (await api(`/projects/${projectId}/test-suites`, token, 'POST', { name, parent_suite_id: parent })).json()) as {
    suite: { id: string };
  };
  for (const [i, steps] of cases.entries()) {
    const created = await api(`/projects/${projectId}/test-suites/${suite.suite.id}/test-cases`, token, 'POST', { title: `${prefix} ${i + 1}`, steps });
    expect(created.status).toBe(201);
    await new Promise((r) => setTimeout(r, 5)); // distinct created_at, so the suite order is defined
  }
  return suite.suite.id;
}

const batchPath = (id = '') => `/projects/${projectId}/run-batches${id && `/${id}`}`;
const getBatch = async (id: string) => (await (await api(batchPath(id), token)).json()) as Batch;

async function waitForBatch(id: string, ms = 90_000): Promise<Batch> {
  const deadline = Date.now() + ms;
  for (;;) {
    const b = await getBatch(id);
    if (b.counts.pending + b.counts.running === 0) return b;
    if (Date.now() > deadline) throw new Error(`batch ${id} still active: ${JSON.stringify(b.counts)}`);
    await new Promise((r) => setTimeout(r, 400));
  }
}

describe('F3 run a whole suite', () => {
  it('runs every case in order and none is refused for concurrency', async () => {
    // Five cases against a cap of two concurrent runs: started one by one, all five must pass.
    const suiteId = await suiteOf('five passing', [PASS, PASS, PASS, PASS, PASS]);
    const started = await api(batchPath(), token, 'POST', { suite_id: suiteId });
    expect(started.status).toBe(201);
    const { batch, run_ids } = (await started.json()) as { batch: { id: string }; run_ids: string[] };
    expect(run_ids).toHaveLength(5);

    const done = await waitForBatch(batch.id);
    expect(done.counts).toEqual({ total: 5, pending: 0, running: 0, passed: 5, failed: 0, error: 0 });
    expect(done.batch.test_suites?.name).toBe('five passing');
    expect(done.runs.map((r) => r.id)).toEqual(run_ids); // listed in the suite's order
    expect(done.runs.map((r) => r.test_cases?.title)).toEqual(['case 1', 'case 2', 'case 3', 'case 4', 'case 5']);

    // Executed in that order too: each run started after the one before it finished.
    const { data: times } = await supabase.from('test_runs').select('id, started_at, completed_at').in('id', run_ids);
    const byId = new Map(times!.map((t) => [t.id, t]));
    for (let i = 1; i < run_ids.length; i++) {
      expect(byId.get(run_ids[i])!.started_at >= byId.get(run_ids[i - 1])!.completed_at, `run ${i + 1} started after run ${i} ended`).toBe(true);
    }
  }, 120_000);

  it('a failing case does not stop the cases after it', async () => {
    const failing = [{ step_number: 1, action: 'assert_text', instruction: 'Wrong text', selector: 'h1', value: 'Nope' }];
    const suiteId = await suiteOf('mixed', [PASS, failing, PASS]);
    const { batch } = (await (await api(batchPath(), token, 'POST', { suite_id: suiteId })).json()) as { batch: { id: string } };
    const done = await waitForBatch(batch.id);
    expect(done.runs.map((r) => r.status)).toEqual(['passed', 'failed', 'passed']);
  }, 120_000);

  it('stop all ends the running case and the ones not started, within seconds', async () => {
    const suiteId = await suiteOf('slow then more', [SLOW, PASS, PASS]);
    const { batch, run_ids } = (await (await api(batchPath(), token, 'POST', { suite_id: suiteId })).json()) as {
      batch: { id: string };
      run_ids: string[];
    };
    // Wait until the first case is busy on its 15 s wait.
    for (let i = 0; i < 100; i++) {
      const { count } = await supabase.from('test_steps').select('id', { count: 'exact', head: true }).eq('test_run_id', run_ids[0]);
      if (count) break;
      await new Promise((r) => setTimeout(r, 100));
    }
    const started = Date.now();
    const stopped = await api(batchPath(`${batch.id}/cancel`), token, 'POST', {});
    expect(stopped.status).toBe(202);
    expect(((await stopped.json()) as { stopped: number }).stopped).toBe(3);

    const done = await waitForBatch(batch.id, 10_000);
    expect(Date.now() - started).toBeLessThan(6_000);
    expect(done.runs.map((r) => r.status)).toEqual(['error', 'error', 'error']);
    expect(done.runs.every((r) => r.error_message === 'Stopped by you before it finished.')).toBe(true);

    // The two cases that never started must not start later.
    await new Promise((r) => setTimeout(r, 2_000));
    const { count } = await supabase.from('test_steps').select('id', { count: 'exact', head: true }).in('test_run_id', run_ids.slice(1));
    expect(count).toBe(0);
  }, 60_000);

  it('refuses an empty suite, an unknown suite, and another user', async () => {
    const empty = await suiteOf('empty', []);
    expect((await api(batchPath(), token, 'POST', { suite_id: empty })).status).toBe(400);
    expect((await api(batchPath(), token, 'POST', { suite_id: '3f2b8c1e-9d4a-4f6b-8e2a-1c5d7e9f0a3b' })).status).toBe(404);

    const suiteId = await suiteOf('private', [PASS]);
    const { batch } = (await (await api(batchPath(), token, 'POST', { suite_id: suiteId })).json()) as { batch: { id: string } };
    const alice = await signIn(USERS.alice);
    expect((await api(batchPath(), alice.token, 'POST', { suite_id: suiteId })).status).toBe(404);
    expect((await api(batchPath(batch.id), alice.token)).status).toBe(404);
    expect((await api(batchPath(`${batch.id}/cancel`), alice.token, 'POST', {})).status).toBe(404);
    expect((await waitForBatch(batch.id)).counts.passed).toBe(1); // her attempts changed nothing
  }, 60_000);

  it('G4: a parent suite runs its own cases, then each sub-suite in turn; a sub-suite still runs alone', async () => {
    const parent = await suiteOf('parent', [PASS], { prefix: 'parent' });
    const first = await suiteOf('first child', [PASS, PASS], { parent, prefix: 'first' });
    await suiteOf('second child', [PASS], { parent, prefix: 'second' });

    const started = await api(batchPath(), token, 'POST', { suite_id: parent });
    expect(started.status).toBe(201);
    const { batch, run_ids } = (await started.json()) as { batch: { id: string }; run_ids: string[] };
    const done = await waitForBatch(batch.id);
    expect(done.runs.map((r) => r.test_cases?.title)).toEqual(['parent 1', 'first 1', 'first 2', 'second 1']);
    expect(done.runs.map((r) => r.id)).toEqual(run_ids);
    expect(done.counts.passed).toBe(4);
    expect(done.batch.suite_id).toBe(parent);

    const alone = (await (await api(batchPath(), token, 'POST', { suite_id: first })).json()) as { batch: { id: string }; run_ids: string[] };
    expect(alone.run_ids).toHaveLength(2);
    await waitForBatch(alone.batch.id);
  }, 120_000);

  it('G4: a parent with no cases of its own runs its sub-suites, and the 50-case cap counts them', async () => {
    const folder = await suiteOf('folder', []);
    await suiteOf('only child', [PASS], { parent: folder, prefix: 'child' });
    const started = await api(batchPath(), token, 'POST', { suite_id: folder });
    expect(started.status).toBe(201);
    await waitForBatch(((await started.json()) as { batch: { id: string } }).batch.id);

    // 26 cases in a parent and 25 in its sub-suite: 51 together is over the cap, so nothing starts.
    const big = await suiteOf('big parent', []);
    const bigChild = await suiteOf('big child', [], { parent: big });
    const rows = (suiteId: string, n: number) => Array.from({ length: n }, (_, i) => ({ suite_id: suiteId, title: `bulk ${i + 1}`, steps: PASS }));
    const { error } = await supabase.from('test_cases').insert([...rows(big, 26), ...rows(bigChild, 25)]);
    expect(error).toBeNull();
    const refused = await api(batchPath(), token, 'POST', { suite_id: big });
    expect(refused.status).toBe(400);
    expect(((await refused.json()) as { error: { message: string } }).error.message).toMatch(/limited to 50 test cases/);
  }, 120_000);
});
