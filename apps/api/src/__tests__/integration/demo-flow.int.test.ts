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
import { supabase } from '../../config/supabase.js';

const api = useApi();

const suiteCount = async (projectId: string) =>
  (await supabase.from('test_suites').select('id', { count: 'exact', head: true }).eq('project_id', projectId)).count;

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
    });
    expect(gen.status).toBe(200);
    const body = (await gen.json()) as { provider_used: string; model_used: string; drafts: { title: string }[] };
    expect(body.provider_used).toBe('local-demo');
    expect(body.model_used).toBe('Local demo, not AI');

    // AI-2: generating saves nothing; only the drafts the user approves are saved.
    expect(await suiteCount(projectId)).toBe(0);
    const wanted = ['Log in with the demo account', 'Coupon SAVE10 takes 10% off the total'];
    const approve = await api(`/projects/${projectId}/ai/approve`, token, 'POST', {
      suite_name: 'Demo shop',
      ai_generated: false,
      test_cases: body.drafts.filter((d) => wanted.includes(d.title)),
    });
    expect(approve.status).toBe(201);
    const saved = (await approve.json()) as { suite_id: string; test_cases: { id: string; title: string }[] };
    expect(saved.test_cases.map((c) => c.title).sort()).toEqual([...wanted].sort());
    const { data: rows } = await supabase.from('test_cases').select('is_ai_generated, source').eq('suite_id', saved.suite_id);
    expect(rows).toEqual([
      { is_ai_generated: false, source: 'manual' },
      { is_ai_generated: false, source: 'manual' },
    ]);
    const byTitle = Object.fromEntries(saved.test_cases.map((c) => [c.title, c.id]));
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

  it('refuses an invalid draft without leaving an empty suite, and a suite of another user', async () => {
    const projectId = await createProject('demo-flow-approve', demoUrl);
    const bad = await api(`/projects/${projectId}/ai/approve`, token, 'POST', {
      suite_name: 'Should not exist',
      test_cases: [{ title: 'fill without a value', steps: [{ step_number: 1, action: 'fill', instruction: 'Type', selector: '#x' }] }],
    });
    expect(bad.status).toBe(400);
    expect(await suiteCount(projectId)).toBe(0);

    const { token: bobToken } = await signIn(USERS.bob);
    const bobProject = ((await (await api('/projects', bobToken, 'POST', { name: 'bob-approve', base_url: demoUrl })).json()) as {
      project: { id: string };
    }).project.id;
    const bobSuite = ((await (await api(`/projects/${bobProject}/test-suites`, bobToken, 'POST', { name: 'bob' })).json()) as {
      suite: { id: string };
    }).suite.id;
    try {
      const steal = await api(`/projects/${projectId}/ai/approve`, token, 'POST', {
        suite_id: bobSuite,
        test_cases: [{ title: 'into bob', steps: [{ step_number: 1, action: 'navigate', instruction: 'Open', value: '/' }] }],
      });
      expect(steal.status).toBe(404);
      const { count } = await supabase.from('test_cases').select('id', { count: 'exact', head: true }).eq('suite_id', bobSuite);
      expect(count).toBe(0);
    } finally {
      await api(`/projects/${bobProject}`, bobToken, 'DELETE');
    }
  });

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
