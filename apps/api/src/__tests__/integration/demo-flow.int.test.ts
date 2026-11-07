/**
 * The stranger flow through the real API, local Supabase and Chromium, with no AI key:
 * demo shop project → local demo generation (AI-3) → runs that pass, and a planted bug that
 * fails and files a bug. Also the SSRF guard through the API (SEC-3): only 127.0.0.1 is
 * allowed here (vitest.integration.config.ts), so a project on `localhost` must be refused.
 */
import { spawn, type ChildProcess } from 'node:child_process';
import http from 'node:http';
import type { AddressInfo } from 'node:net';
import { fileURLToPath } from 'node:url';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { USERS, signIn, useApi } from './helpers.js';

const api = useApi();

let demo: ChildProcess;
let demoUrl: string;
let token: string;
const projects: string[] = [];

beforeAll(async () => {
  ({ token } = await signIn(USERS.alice));
  const server = fileURLToPath(new URL('../../../../demo-app/server.mjs', import.meta.url));
  demo = spawn(process.execPath, [server], { env: { ...process.env, PORT: '0' } });
  demoUrl = await new Promise<string>((resolve, reject) => {
    demo.once('error', reject);
    demo.stdout!.on('data', (c: Buffer) => {
      const url = /listening on (http:\/\/\S+)/.exec(c.toString())?.[1];
      if (url) resolve(`${url}/`);
    });
  });
});

afterAll(async () => {
  for (const id of projects) await api(`/projects/${id}`, token, 'DELETE');
  demo?.kill();
});

async function createProject(name: string, base_url: string): Promise<string> {
  const res = await api('/projects', token, 'POST', { name, base_url });
  expect(res.status).toBe(201);
  const id = ((await res.json()) as { project: { id: string } }).project.id;
  projects.push(id);
  return id;
}

type RunDetail = {
  test_run: { status: string; error_message: string | null };
  steps: { status: string }[];
  bugs: { id: string; title: string }[];
};

async function run(projectId: string, testCaseId: string): Promise<RunDetail> {
  const res = await api(`/projects/${projectId}/test-runs`, token, 'POST', { test_case_id: testCaseId, mode: 'ai_driven' });
  expect(res.status).toBe(201);
  const runId = ((await res.json()) as { test_run: { id: string } }).test_run.id;
  const deadline = Date.now() + 60_000;
  for (;;) {
    const detail = (await (await api(`/projects/${projectId}/test-runs/${runId}`, token)).json()) as RunDetail;
    if (!['pending', 'running'].includes(detail.test_run.status)) return detail;
    if (Date.now() > deadline) throw new Error(`run still ${detail.test_run.status}`);
    await new Promise((r) => setTimeout(r, 500));
  }
}

describe('AI-3 local demo generation with no AI key', () => {
  it('generates demo cases, labelled not AI, that pass against the demo shop and catch its planted bug', async () => {
    const projectId = await createProject('demo-flow', demoUrl);

    const gen = await api(`/projects/${projectId}/ai/generate`, token, 'POST', {
      prompt: 'Test the login page and the checkout with a coupon',
      suite_name: 'Demo shop',
    });
    expect(gen.status).toBe(201);
    const body = (await gen.json()) as {
      provider_used: string;
      model_used: string;
      test_cases: { id: string; title: string }[];
    };
    expect(body.provider_used).toBe('local-demo');
    expect(body.model_used).toBe('Local demo, not AI');
    const byTitle = Object.fromEntries(body.test_cases.map((c) => [c.title, c.id]));
    expect(Object.keys(byTitle)).toContain('Log in with the demo account');
    expect(Object.keys(byTitle)).toContain('Coupon SAVE10 takes 10% off the total');

    const login = await run(projectId, byTitle['Log in with the demo account']);
    expect(login.test_run.error_message).toBeNull();
    expect(login.test_run.status).toBe('passed');
    expect(login.bugs).toEqual([]);

    const coupon = await run(projectId, byTitle['Coupon SAVE10 takes 10% off the total']);
    expect(coupon.test_run.status).toBe('failed');
    expect(coupon.steps.at(-1)?.status).toBe('failed');
    expect(coupon.bugs).toHaveLength(1);
  }, 120_000);

  it('does not fall back when the user asks for a specific provider they have no key for', async () => {
    const projectId = await createProject('demo-flow-provider', demoUrl);
    const gen = await api(`/projects/${projectId}/ai/generate`, token, 'POST', {
      prompt: 'Test the login page',
      provider: 'openai',
    });
    expect(gen.status).toBe(400);
  });
});

describe('SEC-3 SSRF guard through the API', () => {
  it('refuses http(s)-less project URLs', async () => {
    const res = await api('/projects', token, 'POST', { name: 'bad-url', base_url: 'file:///etc/passwd' });
    expect(res.status).toBe(400);
  });

  it('ends a run against a private host that is not allowlisted as error, without touching it', async () => {
    let hits = 0;
    const target = http.createServer((_q, r) => {
      hits += 1;
      r.end('<h1>secret</h1>');
    });
    await new Promise<void>((r) => target.listen(0, '127.0.0.1', r));
    const port = (target.address() as AddressInfo).port;
    try {
      const projectId = await createProject('ssrf', `http://localhost:${port}/`);
      const suite = (await (await api(`/projects/${projectId}/test-suites`, token, 'POST', { name: 's' })).json()) as {
        suite: { id: string };
      };
      const created = await api(`/projects/${projectId}/test-suites/${suite.suite.id}/test-cases`, token, 'POST', {
        title: 'reach localhost',
        steps: [{ step_number: 1, action: 'assert_visible', instruction: 'Heading shows', selector: 'h1' }],
      });
      const caseId = ((await created.json()) as { test_case: { id: string } }).test_case.id;

      const detail = await run(projectId, caseId);
      expect(detail.test_run.status).toBe('error');
      expect(detail.test_run.error_message).toMatch(/Base URL not allowed: Refusing to open localhost: .*private/);
      expect(detail.bugs).toEqual([]);
      expect(hits).toBe(0);
    } finally {
      await new Promise<void>((r) => target.close(() => r()));
    }
  }, 60_000);
});
