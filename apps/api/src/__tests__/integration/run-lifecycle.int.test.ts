/**
 * RUN-1/EXE-1 end to end: POST /test-runs → executeTestOrchestration → real Chromium → DB rows.
 * Prereq: local Supabase (`supabase start && supabase db reset`) and Playwright Chromium.
 * The application under test is a fixture page served by this file on 127.0.0.1.
 */
import http from 'node:http';
import type { AddressInfo } from 'node:net';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { USERS, signIn, useApi } from './helpers.js';
import { supabase } from '../../config/supabase.js';
import { executeTestOrchestration, reapInterruptedRuns, shutdownRuns } from '../../services/run-executor.js';

const api = useApi();

const FIXTURE = `<!doctype html><title>Fixture</title><h1>Hello fixture</h1>
  <input id="name" /><button id="go" onclick="document.getElementById('out').textContent='Hi '+document.getElementById('name').value">Go</button>
  <p id="out"></p>`;

let target: http.Server;
let targetUrl: string;
let token: string;
let userId: string;
let projectId: string;
let casesPath: string;

beforeAll(async () => {
  target = http.createServer((_req, res) => res.writeHead(200, { 'Content-Type': 'text/html' }).end(FIXTURE));
  await new Promise<void>((r) => target.listen(0, '127.0.0.1', r));
  targetUrl = `http://127.0.0.1:${(target.address() as AddressInfo).port}/`;

  ({ token, id: userId } = await signIn(USERS.bob));
  const project = (await (await api('/projects', token, 'POST', { name: 'run1-lifecycle', base_url: targetUrl })).json()) as {
    project: { id: string };
  };
  projectId = project.project.id;
  const suite = (await (await api(`/projects/${projectId}/test-suites`, token, 'POST', { name: 'runs' })).json()) as {
    suite: { id: string };
  };
  casesPath = `/projects/${projectId}/test-suites/${suite.suite.id}/test-cases`;
});

afterAll(async () => {
  if (projectId) await api(`/projects/${projectId}`, token, 'DELETE');
  await new Promise<void>((r) => target.close(() => r()));
});

type RunDetail = {
  test_run: { id: string; status: string; error_message: string | null; completed_at: string | null };
  steps: { step_number: number; action: string; instruction: string; status: string; screenshot_url: string | null }[];
  bugs: { id: string }[];
};

async function createCase(steps: unknown[]): Promise<string> {
  const created = await api(casesPath, token, 'POST', { title: `case ${Date.now()}`, steps });
  expect(created.status).toBe(201);
  return ((await created.json()) as { test_case: { id: string } }).test_case.id;
}

async function runCase(steps: unknown[]): Promise<RunDetail> {
  const caseId = await createCase(steps);
  const runRes = await api(`/projects/${projectId}/test-runs`, token, 'POST', { test_case_id: caseId, mode: 'ai_driven' });
  expect(runRes.status).toBe(201);
  const runId = ((await runRes.json()) as { test_run: { id: string } }).test_run.id;
  return waitForRun(runId);
}

async function waitForRun(runId: string): Promise<RunDetail> {
  const deadline = Date.now() + 60_000;
  for (;;) {
    const detail = (await (await api(`/projects/${projectId}/test-runs/${runId}`, token)).json()) as RunDetail;
    if (!['pending', 'running'].includes(detail.test_run.status)) return detail;
    if (Date.now() > deadline) throw new Error(`run ${runId} still ${detail.test_run.status} after 60s`);
    await new Promise((r) => setTimeout(r, 500));
  }
}

describe('RUN-1 run lifecycle through the API', () => {
  it('a passing case ends passed with every step persisted and no bug', async () => {
    const run = await runCase([
      { step_number: 1, action: 'assert_text', instruction: 'Heading greets', selector: 'h1', value: 'Hello' },
      { step_number: 2, action: 'fill', instruction: 'Type a name', selector: '#name', value: 'Ada' },
      { step_number: 3, action: 'click', instruction: 'Press Go', selector: '#go' },
      { step_number: 4, action: 'assert_text', instruction: 'Greeting shown', selector: '#out', value: 'Hi Ada' },
    ]);
    expect(run.test_run.error_message).toBeNull();
    expect(run.test_run.status).toBe('passed');
    expect(run.test_run.completed_at).not.toBeNull();
    expect(run.steps.map((s) => [s.action, s.instruction, s.status])).toEqual([
      ['assert_text', 'Heading greets', 'passed'],
      ['fill', 'Type a name', 'passed'],
      ['click', 'Press Go', 'passed'],
      ['assert_text', 'Greeting shown', 'passed'],
    ]);
    expect(run.steps.every((s) => s.screenshot_url)).toBe(true);
    expect(run.bugs).toHaveLength(0);

    // EXE-3: the row stores the private bucket path; the API hands out a working signed URL,
    // and the old public URL no longer serves the image.
    const { data: stored } = await supabase
      .from('test_steps')
      .select('screenshot_url')
      .eq('test_run_id', run.test_run.id)
      .eq('step_number', 1)
      .single();
    expect(stored!.screenshot_url).toBe(`screenshots/${run.test_run.id}/step_1.png`);
    const signedUrl = run.steps[0].screenshot_url!;
    expect(signedUrl).toMatch(/\/storage\/v1\/object\/sign\/test-artifacts\/screenshots\//);
    const image = await fetch(signedUrl);
    expect(image.status).toBe(200);
    expect(image.headers.get('content-type')).toBe('image/png');
    const publicUrl = `${process.env.SUPABASE_URL}/storage/v1/object/public/test-artifacts/${stored!.screenshot_url}`;
    expect((await fetch(publicUrl)).status).toBeGreaterThanOrEqual(400);
  }, 90_000);

  it('a failing assertion ends failed, skips the rest and files a bug', async () => {
    const run = await runCase([
      { step_number: 1, action: 'assert_text', instruction: 'Wrong heading', selector: 'h1', value: 'Goodbye' },
      { step_number: 2, action: 'click', instruction: 'Press Go', selector: '#go' },
    ]);
    expect(run.test_run.status).toBe('failed');
    expect(run.steps.map((s) => s.status)).toEqual(['failed', 'skipped']);
    expect(run.bugs).toHaveLength(1);
  }, 90_000);

  it('an unreachable target ends error (not passed) and files no bug', async () => {
    expect((await api(`/projects/${projectId}`, token, 'PUT', { base_url: 'http://127.0.0.1:1/' })).status).toBe(200);
    try {
      const run = await runCase([{ step_number: 1, action: 'assert_visible', instruction: 'Heading', selector: 'h1' }]);
      expect(run.test_run.status).toBe('error');
      expect(run.test_run.error_message).toMatch(/Could not open base URL/);
      expect(run.bugs).toHaveLength(0);
    } finally {
      await api(`/projects/${projectId}`, token, 'PUT', { base_url: targetUrl });
    }
  }, 90_000);
});

describe('EXE-1 single executor', () => {
  const ONE_STEP = [{ step_number: 1, action: 'assert_visible', instruction: 'Heading', selector: 'h1' }];

  it('rejects a run without a saved test case', async () => {
    const res = await api(`/projects/${projectId}/test-runs`, token, 'POST', { mode: 'ai_driven', nl_input: 'do stuff' });
    expect(res.status).toBe(400);
  });

  it('executes a run exactly once when started twice concurrently', async () => {
    const caseId = await createCase([...ONE_STEP, { ...ONE_STEP[0], step_number: 2 }]);
    const { data: run, error } = await supabase
      .from('test_runs')
      .insert({ project_id: projectId, user_id: userId, test_case_id: caseId, mode: 'ai_driven', status: 'pending', browser: 'chromium' })
      .select('id')
      .single();
    expect(error).toBeNull();

    const payload = { test_run_id: run!.id, project_id: projectId };
    await Promise.all([
      executeTestOrchestration(undefined, userId, payload),
      executeTestOrchestration(undefined, userId, payload),
    ]);

    const detail = await waitForRun(run!.id);
    expect(detail.test_run.status).toBe('passed');
    expect(detail.steps.map((s) => s.step_number)).toEqual([1, 2]); // not [1, 1, 2, 2]
  }, 90_000);

  it('ends with error when a screenshot cannot be stored', async () => {
    const { data: bucket } = await supabase.storage.getBucket('test-artifacts');
    expect(bucket).not.toBeNull();
    await supabase.storage.updateBucket('test-artifacts', { public: bucket!.public, allowedMimeTypes: ['image/jpeg'] });
    try {
      const run = await runCase(ONE_STEP);
      expect(run.test_run.status).toBe('error');
      expect(run.test_run.error_message).toMatch(/Screenshot upload failed for step 1/);
      expect(run.test_run.completed_at).not.toBeNull();
      expect(run.bugs).toHaveLength(0);
    } finally {
      await supabase.storage.updateBucket('test-artifacts', {
        public: bucket!.public,
        // null (not undefined) clears the restriction; undefined would leave image/jpeg in place.
        allowedMimeTypes: bucket!.allowed_mime_types ?? null,
        fileSizeLimit: bucket!.file_size_limit ?? null,
      });
    }
  }, 90_000);
});

describe('EXE-2 no permanently stuck runs', () => {
  async function insertRun(status: 'pending' | 'running', steps: unknown[]) {
    const caseId = await createCase(steps);
    const { data, error } = await supabase
      .from('test_runs')
      .insert({ project_id: projectId, user_id: userId, test_case_id: caseId, mode: 'ai_driven', status, browser: 'chromium' })
      .select('id')
      .single();
    expect(error).toBeNull();
    return data!.id as string;
  }

  it('boot reaper marks runs orphaned by a previous process as error', async () => {
    const runId = await insertRun('running', [{ step_number: 1, action: 'assert_visible', instruction: 'h', selector: 'h1' }]);
    expect(await reapInterruptedRuns()).toBeGreaterThanOrEqual(1);
    const run = (await waitForRun(runId)).test_run;
    expect(run.status).toBe('error');
    expect(run.error_message).toMatch(/^Interrupted/);
    expect(run.completed_at).not.toBeNull();
  });

  it('shutdown cancels an in-flight run and records it as interrupted', async () => {
    const runId = await insertRun('pending', [
      { step_number: 1, action: 'assert_visible', instruction: 'Heading', selector: 'h1' },
      { step_number: 2, action: 'wait_for', instruction: 'Never appears', selector: '#never' },
    ]);
    const execution = executeTestOrchestration(undefined, userId, { test_run_id: runId, project_id: projectId });

    // Wait until step 1 is persisted, i.e. the browser is busy on step 2's 15 s wait.
    for (let i = 0; i < 100; i++) {
      const { count } = await supabase.from('test_steps').select('id', { count: 'exact', head: true }).eq('test_run_id', runId);
      if (count) break;
      await new Promise((r) => setTimeout(r, 100));
    }
    const started = Date.now();
    await shutdownRuns(10_000);
    await execution;
    expect(Date.now() - started).toBeLessThan(10_000);

    const run = (await waitForRun(runId)).test_run;
    expect(run.status).toBe('error');
    expect(run.error_message).toMatch(/^Interrupted/);
  }, 60_000);
});
