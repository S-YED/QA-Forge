/**
 * F8 run from CI: a project token starts a suite run and reads its result, for its own project only.
 * The token is shown once, stored only as a hash, and stops working when deleted.
 * Prereq: local Supabase with migrations 26 and 28, and Playwright Chromium.
 */
import { createHash } from 'node:crypto';
import http from 'node:http';
import type { AddressInfo } from 'node:net';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { USERS, signIn, useApi } from './helpers.js';
import { supabase } from '../../config/supabase.js';

const api = useApi();

const PASS = [{ step_number: 1, action: 'assert_visible', instruction: 'Heading', selector: 'h1' }];
const FAIL = [{ step_number: 1, action: 'assert_text', instruction: 'Wrong text', selector: 'h1', value: 'Nope' }];

let target: http.Server;
let targetUrl = '';
let token = '';
let projectId = '';
let otherProjectId = '';
let secret = '';
let tokenId = '';

type Listed = { id: string; name: string; token_prefix: string; last_used_at: string | null };
type CiBatch = {
  batch_id: string;
  suite: string;
  status: 'running' | 'passed' | 'failed';
  counts: { total: number; passed: number; failed: number };
  runs: { title: string; status: string; error_message: string | null }[];
};

const ci = (path: string, bearer: string | null, method = 'GET') => api(`/ci${path}`, bearer ?? '', method, method === 'POST' ? {} : undefined);

async function project(name: string): Promise<string> {
  const res = (await (await api('/projects', token, 'POST', { name, base_url: targetUrl })).json()) as { project: { id: string } };
  return res.project.id;
}

async function suiteOf(pid: string, name: string, cases: unknown[][]): Promise<string> {
  const suite = (await (await api(`/projects/${pid}/test-suites`, token, 'POST', { name })).json()) as { suite: { id: string } };
  for (const [i, steps] of cases.entries()) {
    const created = await api(`/projects/${pid}/test-suites/${suite.suite.id}/test-cases`, token, 'POST', { title: `case ${i + 1}`, steps });
    expect(created.status).toBe(201);
    await new Promise((r) => setTimeout(r, 5));
  }
  return suite.suite.id;
}

async function waitForCi(batchId: string): Promise<CiBatch> {
  const deadline = Date.now() + 90_000;
  for (;;) {
    const b = (await (await ci(`/batches/${batchId}`, secret)).json()) as CiBatch;
    if (b.status !== 'running') return b;
    if (Date.now() > deadline) throw new Error(`suite run ${batchId} still running`);
    await new Promise((r) => setTimeout(r, 400));
  }
}

beforeAll(async () => {
  target = http.createServer((_req, res) => res.writeHead(200, { 'Content-Type': 'text/html' }).end('<!doctype html><title>Fixture</title><h1>Hello fixture</h1>'));
  await new Promise<void>((r) => target.listen(0, '127.0.0.1', r));
  targetUrl = `http://127.0.0.1:${(target.address() as AddressInfo).port}/`;
  ({ token } = await signIn(USERS.bob));
  projectId = await project('f8-ci');
  otherProjectId = await project('f8-ci-other');
});

afterAll(async () => {
  for (const id of [projectId, otherProjectId]) if (id) await api(`/projects/${id}`, token, 'DELETE');
  await new Promise<void>((r) => target.close(() => r()));
});

describe('F8 project tokens', () => {
  it('shows the token once and stores only its hash', async () => {
    const created = await api(`/projects/${projectId}/tokens`, token, 'POST', { name: 'GitHub Actions' });
    expect(created.status).toBe(201);
    const body = (await created.json()) as { token: Listed; secret: string };
    secret = body.secret;
    tokenId = body.token.id;
    expect(secret).toMatch(/^qf_[A-Za-z0-9_-]{40,}$/);
    expect(body.token).toMatchObject({ name: 'GitHub Actions', token_prefix: secret.slice(0, 10), last_used_at: null });

    const listed = await (await api(`/projects/${projectId}/tokens`, token)).text();
    expect(listed).not.toContain(secret);
    expect(listed).not.toContain('token_hash');

    const { data: row } = await supabase.from('project_tokens').select('*').eq('id', tokenId).single();
    expect(JSON.stringify(row)).not.toContain(secret);
    expect(row!.token_hash).toBe(createHash('sha256').update(secret).digest('hex'));
  });

  it("another user cannot see, create or delete this project's tokens", async () => {
    const alice = await signIn(USERS.alice);
    expect((await api(`/projects/${projectId}/tokens`, alice.token)).status).toBe(404);
    expect((await api(`/projects/${projectId}/tokens`, alice.token, 'POST', { name: 'hers' })).status).toBe(404);
    expect((await api(`/projects/${projectId}/tokens/${tokenId}`, alice.token, 'DELETE')).status).toBe(404);
  });
});

describe('F8 run a suite from CI', () => {
  it('starts a suite run with the token and reports passed when every case passed', async () => {
    const suiteId = await suiteOf(projectId, 'ci passing', [PASS, PASS]);
    const started = await ci(`/suites/${suiteId}/run`, secret, 'POST');
    expect(started.status).toBe(201);
    const { batch_id, total, status_path } = (await started.json()) as { batch_id: string; total: number; status_path: string };
    expect(total).toBe(2);
    expect(status_path).toBe(`/api/ci/batches/${batch_id}`);

    const done = await waitForCi(batch_id);
    expect(done).toMatchObject({ status: 'passed', suite: 'ci passing', counts: { total: 2, passed: 2, failed: 0 } });
    expect(done.runs.map((r) => [r.title, r.status])).toEqual([
      ['case 1', 'passed'],
      ['case 2', 'passed'],
    ]);

    // The same suite run is visible to the owner in the web app, and the token shows as used.
    expect((await api(`/projects/${projectId}/run-batches/${batch_id}`, token)).status).toBe(200);
    const list = ((await (await api(`/projects/${projectId}/tokens`, token)).json()) as { tokens: Listed[] }).tokens;
    expect(list[0].last_used_at).not.toBeNull();
  }, 120_000);

  it('reports failed when any case did not pass, with the reason', async () => {
    const suiteId = await suiteOf(projectId, 'ci failing', [PASS, FAIL]);
    const { batch_id } = (await (await ci(`/suites/${suiteId}/run`, secret, 'POST')).json()) as { batch_id: string };
    const done = await waitForCi(batch_id);
    expect(done.status).toBe('failed');
    expect(done.counts).toMatchObject({ total: 2, passed: 1, failed: 1 });
    expect(done.runs[1].error_message).toMatch(/Step 1 failed/);
  }, 120_000);

  it('refuses a missing, malformed or unknown token', async () => {
    const suiteId = await suiteOf(projectId, 'ci auth', [PASS]);
    const unknown = `qf_${'a'.repeat(43)}`;
    for (const bearer of [null, 'not-a-token', unknown, token /* a signed-in session is not a project token */]) {
      const res = await ci(`/suites/${suiteId}/run`, bearer, 'POST');
      expect(res.status, String(bearer).slice(0, 12)).toBe(401);
    }
    // And a project token is not a session: it opens nothing outside /api/ci.
    expect((await api('/projects', secret)).status).toBe(401);
    expect((await api(`/projects/${projectId}/tokens`, secret)).status).toBe(401);
  });

  it('acts only on its own project', async () => {
    const foreignSuite = await suiteOf(otherProjectId, 'other project', [PASS]);
    expect((await ci(`/suites/${foreignSuite}/run`, secret, 'POST')).status).toBe(404);

    // A suite run of the other project, started by its owner, cannot be read with this token.
    const { batch } = (await (await api(`/projects/${otherProjectId}/run-batches`, token, 'POST', { suite_id: foreignSuite })).json()) as {
      batch: { id: string };
    };
    expect((await ci(`/batches/${batch.id}`, secret)).status).toBe(404);
  }, 60_000);

  it('stops working the moment it is deleted', async () => {
    const suiteId = await suiteOf(projectId, 'ci revoked', [PASS]);
    expect((await api(`/projects/${projectId}/tokens/${tokenId}`, token, 'DELETE')).status).toBe(204);
    expect((await ci(`/suites/${suiteId}/run`, secret, 'POST')).status).toBe(401);
    const { count } = await supabase.from('run_batches').select('id', { count: 'exact', head: true }).eq('suite_id', suiteId);
    expect(count).toBe(0);
  });
});
