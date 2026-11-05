/**
 * RUN-1 end to end: POST /test-runs → executeTestOrchestration → real Chromium → DB rows.
 * Prereq: local Supabase (`supabase start && supabase db reset`) and Playwright Chromium.
 * The application under test is a fixture page served by this file on 127.0.0.1.
 */
import http from 'node:http';
import type { AddressInfo } from 'node:net';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { USERS, signIn, useApi } from './helpers.js';

const api = useApi();

const FIXTURE = `<!doctype html><title>Fixture</title><h1>Hello fixture</h1>
  <input id="name" /><button id="go" onclick="document.getElementById('out').textContent='Hi '+document.getElementById('name').value">Go</button>
  <p id="out"></p>`;

let target: http.Server;
let targetUrl: string;
let token: string;
let projectId: string;
let casesPath: string;

beforeAll(async () => {
  target = http.createServer((_req, res) => res.writeHead(200, { 'Content-Type': 'text/html' }).end(FIXTURE));
  await new Promise<void>((r) => target.listen(0, '127.0.0.1', r));
  targetUrl = `http://127.0.0.1:${(target.address() as AddressInfo).port}/`;

  token = (await signIn(USERS.bob)).token;
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
  test_run: { status: string; error_message: string | null; completed_at: string | null };
  steps: { step_number: number; action: string; instruction: string; status: string; screenshot_url: string | null }[];
  bugs: { id: string }[];
};

async function runCase(steps: unknown[]): Promise<RunDetail> {
  const created = await api(casesPath, token, 'POST', { title: `case ${Date.now()}`, steps });
  expect(created.status).toBe(201);
  const caseId = ((await created.json()) as { test_case: { id: string } }).test_case.id;

  const runRes = await api(`/projects/${projectId}/test-runs`, token, 'POST', { test_case_id: caseId, mode: 'ai_driven' });
  expect(runRes.status).toBe(201);
  const runId = ((await runRes.json()) as { test_run: { id: string } }).test_run.id;

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
