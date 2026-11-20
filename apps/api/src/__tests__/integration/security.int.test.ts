/**
 * Security regression tests against a real local Supabase + in-process API.
 * Prereq: `supabase start && supabase db reset` (seed users alice/bob/demo).
 *
 * SEC-1: profiles column lockdown (migration 22) — no self-escalation to admin,
 *        demo user cannot delete its profile.
 * SEC-2: AI optimize cannot read/overwrite another user's test case (IDOR).
 * CON-1: test-case writes enforce the shared step contract with field-level 400s.
 */
import http from 'node:http';
import type { AddressInfo } from 'node:net';
import { describe, expect, it, vi } from 'vitest';
import { supabase } from '../../config/supabase.js';
import { stopRun } from '../../services/run-executor.js';
import { ANON_KEY, SUPABASE_URL, USERS, signIn, useApi } from './helpers.js';

const api = useApi();

function rest(path: string, token: string, init: RequestInit = {}) {
  return fetch(`${SUPABASE_URL}/rest/v1/${path}`, {
    ...init,
    headers: {
      apikey: ANON_KEY,
      Authorization: `Bearer ${token}`,
      'Content-Type': 'application/json',
      Prefer: 'return=representation',
      ...init.headers,
    },
  });
}

async function pgErrorCode(res: Response) {
  expect([401, 403]).toContain(res.status);
  return ((await res.json()) as { code: string }).code;
}

async function withBobProject(name: string, fn: (projectId: string, token: string) => Promise<void>) {
  const bob = await signIn(USERS.bob);
  const created = (await (await api('/projects', bob.token, 'POST', { name })).json()) as {
    project: { id: string };
  };
  try {
    await fn(created.project.id, bob.token);
  } finally {
    await api(`/projects/${created.project.id}`, bob.token, 'DELETE');
  }
}

describe('G6 edges found by the deep-dive probe', () => {
  it('a step the address guard blocks ends the run as error and files no bug', async () => {
    const page = http.createServer((_req, res) => res.writeHead(200, { 'Content-Type': 'text/html' }).end('<h1>Start</h1>'));
    await new Promise<void>((r) => page.listen(0, '127.0.0.1', r));
    try {
      await withBobProject('g6-blocked', async (projectId, token) => {
        await api(`/projects/${projectId}`, token, 'PUT', { base_url: `http://127.0.0.1:${(page.address() as AddressInfo).port}/` });
        const suite = ((await (await api(`/projects/${projectId}/test-suites`, token, 'POST', { name: 's' })).json()) as { suite: { id: string } }).suite;
        const tc = ((await (await api(`/projects/${projectId}/test-suites/${suite.id}/test-cases`, token, 'POST', {
          title: 'opens a javascript: address',
          steps: [{ step_number: 1, action: 'navigate', instruction: 'Open it', value: 'javascript:alert(1)' }],
        })).json()) as { test_case: { id: string } }).test_case;
        const run = ((await (await api(`/projects/${projectId}/test-runs`, token, 'POST', { test_case_id: tc.id, mode: 'ai_driven' })).json()) as { test_run: { id: string } }).test_run;
        let done: { test_run: { status: string; error_message: string }; bugs: unknown[] } | undefined;
        for (let i = 0; i < 60; i++) {
          done = (await (await api(`/projects/${projectId}/test-runs/${run.id}`, token)).json()) as typeof done;
          if (!['pending', 'running'].includes(done!.test_run.status)) break;
          await new Promise((r) => setTimeout(r, 500));
        }
        expect(done!.test_run.status).toBe('error');
        expect(done!.test_run.error_message).toMatch(/^Step 1 cannot run: Refusing to open javascript: URL/);
        expect(done!.bugs).toEqual([]);
      });
    } finally {
      await new Promise<void>((r) => page.close(() => r()));
    }
  }, 60_000);

  it('refuses a suite run on a project with no base URL, an unknown assignee, and too many or too long tags', async () => {
    await withBobProject('g6-edges', async (projectId, token) => {
      const suite = ((await (await api(`/projects/${projectId}/test-suites`, token, 'POST', { name: 's' })).json()) as { suite: { id: string } }).suite;
      const cases = `/projects/${projectId}/test-suites/${suite.id}/test-cases`;
      const step = [{ step_number: 1, action: 'assert_visible', instruction: 'Heading', selector: 'h1' }];
      expect((await api(cases, token, 'POST', { title: 'c', steps: step })).status).toBe(201);

      const batch = await api(`/projects/${projectId}/run-batches`, token, 'POST', { suite_id: suite.id });
      expect(batch.status).toBe(400);
      expect(((await batch.json()) as { error: { message: string } }).error.message).toMatch(/base URL/);

      const bug = ((await (await api(`/projects/${projectId}/bugs`, token, 'POST', { title: 'b' })).json()) as { bug: { id: string } }).bug;
      const assign = await api(`/projects/${projectId}/bugs/${bug.id}`, token, 'PUT', { assigned_to: '00000000-0000-4000-8000-000000000000' });
      expect(assign.status).toBe(400);

      expect((await api(cases, token, 'POST', { title: 't', steps: step, tags: Array.from({ length: 21 }, (_, i) => `t${i}`) })).status).toBe(400);
      expect((await api(cases, token, 'POST', { title: 't', steps: step, tags: ['x'.repeat(51)] })).status).toBe(400);
      expect((await api(cases, token, 'POST', { title: 't', steps: step, tags: Array.from({ length: 20 }, () => 'x'.repeat(50)) })).status).toBe(201);
    });
  });
});

describe('SEC-5 the shared demo account heals itself', () => {
  it('a visitor who changes the demo password does not lock out the next visitor', async () => {
    const first = (await (await api('/auth/demo', '', 'POST')).json()) as { access_token: string };
    // Any signed-in user may change their own password through Supabase Auth; the demo session is handed to everyone.
    const changed = await fetch(`${SUPABASE_URL}/auth/v1/user`, {
      method: 'PUT',
      headers: { apikey: ANON_KEY, Authorization: `Bearer ${first.access_token}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ password: 'changed-by-a-visitor-123' }),
    });
    expect(changed.status).toBe(200);
    try {
      const next = await api('/auth/demo', '', 'POST');
      expect(next.status).toBe(200);
      expect(((await next.json()) as { access_token?: string }).access_token).toBeTruthy();
    } finally {
      // Leave the seed password whatever happened, so later tests and the local demo keep working.
      const { data } = await supabase.from('profiles').select('id').eq('is_demo', true).single();
      await supabase.auth.admin.updateUserById(data!.id, { password: USERS.demo.password });
    }
  });

  it('CR-4: a sign-in that fails for another reason (a rate limit, an outage) does not reset the account', async () => {
    // Resetting the password signs out every demo session, so it must only happen when the password really changed.
    const realFetch = globalThis.fetch;
    const reset = vi.spyOn(supabase.auth.admin, 'updateUserById');
    globalThis.fetch = (async (input: string | URL | Request, init?: RequestInit) => {
      const url = input instanceof Request ? input.url : String(input);
      if (url.includes('/auth/v1/token') && url.includes('grant_type=password')) {
        const body = { code: 'over_request_rate_limit', error_code: 'over_request_rate_limit', message: 'Request rate limit reached' };
        return new Response(JSON.stringify(body), {
          status: 429,
          headers: { 'Content-Type': 'application/json', 'x-supabase-api-version': '2024-01-01' },
        });
      }
      return realFetch(input, init);
    }) as typeof fetch;
    try {
      expect((await api('/auth/demo', '', 'POST')).status).toBe(500);
      expect(reset).not.toHaveBeenCalled();
    } finally {
      globalThis.fetch = realFetch;
      reset.mockRestore();
    }
  });
});

describe('DD-1 a bad request is answered as one, not as a server error', () => {
  it('says 400 for a body that is not JSON, 413 for one too large, 403 for a site that may not call the API', async () => {
    const { token } = await signIn(USERS.bob);
    const notJson = await api('/projects', token, 'POST', undefined, { body: '{"name": ' });
    expect(notJson.status).toBe(400);
    expect(((await notJson.json()) as { error: { message: string } }).error.message).toBe('The request body is not valid JSON');
    const tooBig = await api('/projects', token, 'POST', undefined, { body: JSON.stringify({ name: 'x'.repeat(11 * 1024 * 1024) }) });
    expect(tooBig.status).toBe(413);
    const foreign = await api('/projects', token, 'GET', undefined, { headers: { Origin: 'https://not-qaforge.example' } });
    expect(foreign.status).toBe(403);
  });
});

describe('DD-2 profile edits', () => {
  type Me = { profile: { full_name: string | null; avatar_url: string | null } };
  it('the shared demo account cannot change its profile', async () => {
    const demo = await signIn(USERS.demo);
    const before = ((await (await api('/auth/me', demo.token)).json()) as Me).profile;
    expect((await api('/auth/me', demo.token, 'PUT', { full_name: 'Renamed by a visitor' })).status).toBe(403);
    expect(((await (await api('/auth/me', demo.token)).json()) as Me).profile.full_name).toBe(before.full_name);
  });

  it('clears a name and avatar left empty, and refuses an avatar that is not a web address', async () => {
    const bob = await signIn(USERS.bob);
    const before = ((await (await api('/auth/me', bob.token)).json()) as Me).profile;
    try {
      expect((await api('/auth/me', bob.token, 'PUT', { avatar_url: 'javascript:alert(1)' })).status).toBe(400);
      expect((await api('/auth/me', bob.token, 'PUT', { full_name: '  ', avatar_url: null })).status).toBe(200);
      const cleared = ((await (await api('/auth/me', bob.token)).json()) as Me).profile;
      expect([cleared.full_name, cleared.avatar_url]).toEqual([null, null]);
    } finally {
      await api('/auth/me', bob.token, 'PUT', { full_name: before.full_name, avatar_url: before.avatar_url });
    }
  });
});

describe('CR-2 one sign-in check per request', () => {
  it('checks the token once for a route nested under /projects', async () => {
    await withBobProject('auth-once', async (projectId, token) => {
      const getClaims = vi.spyOn(supabase.auth, 'getClaims');
      try {
        expect((await api(`/projects/${projectId}/test-suites`, token)).status).toBe(200);
        expect(getClaims).toHaveBeenCalledTimes(1);
      } finally {
        getClaims.mockRestore();
      }
    });
  });
});

describe('PERF-1 sign-in checked on this server', () => {
  it('answers signed-in requests without asking Supabase Auth, and reads the profile at most once a minute', async () => {
    await withBobProject('perf-1', async (projectId, token) => {
      const getUser = vi.spyOn(supabase.auth, 'getUser');
      const realFrom = supabase.from.bind(supabase);
      let profileReads = 0;
      const from = vi.spyOn(supabase, 'from').mockImplementation(((table: string) => {
        if (table === 'profiles') profileReads++;
        return realFrom(table);
      }) as typeof supabase.from);
      try {
        for (let i = 0; i < 3; i++) expect((await api(`/projects/${projectId}/test-suites`, token)).status).toBe(200);
        expect(getUser).not.toHaveBeenCalled(); // the token is checked against the published signing keys
        expect(profileReads).toBeLessThanOrEqual(1); // none when an earlier request already kept it
      } finally {
        getUser.mockRestore();
        from.mockRestore();
      }
    });
  });

  it('still refuses a token whose signature does not match, and keys that are not a user', async () => {
    const bob = await signIn(USERS.bob);
    const alice = await signIn(USERS.alice);
    const [head, body, sig] = bob.token.split('.');
    const claims = JSON.parse(Buffer.from(body, 'base64url').toString());
    const forged = [head, Buffer.from(JSON.stringify({ ...claims, sub: alice.id })).toString('base64url'), sig].join('.');
    expect((await api('/projects', forged)).status).toBe(401);
    expect((await api('/projects', `${bob.token}x`)).status).toBe(401);
    expect((await api('/projects', ANON_KEY)).status).toBe(401);
    expect((await api('/projects', bob.token)).status).toBe(200);
  });
});

describe('SEC-1 profiles column lockdown', () => {
  it('rejects a user promoting themselves to admin and keeps RLS isolation', async () => {
    const bob = await signIn(USERS.bob);
    const before = await (await rest('projects?select=id', bob.token)).json();

    const escalate = await rest(`profiles?id=eq.${bob.id}`, bob.token, {
      method: 'PATCH',
      body: JSON.stringify({ role: 'admin' }),
    });
    expect(await pgErrorCode(escalate)).toBe('42501');

    const flagDemo = await rest(`profiles?id=eq.${bob.id}`, bob.token, {
      method: 'PATCH',
      body: JSON.stringify({ is_demo: true }),
    });
    expect(await pgErrorCode(flagDemo)).toBe('42501');

    expect(await (await rest('projects?select=id', bob.token)).json()).toEqual(before);
    const [profile] = (await (await rest(`profiles?id=eq.${bob.id}&select=role`, bob.token)).json()) as Array<{
      role: string;
    }>;
    expect(profile.role).toBe('tester');
  });

  it('still allows editing display fields', async () => {
    const bob = await signIn(USERS.bob);
    const res = await rest(`profiles?id=eq.${bob.id}`, bob.token, {
      method: 'PATCH',
      body: JSON.stringify({ full_name: 'Bob Developer' }),
    });
    expect(res.status).toBe(200);
    const [row] = (await res.json()) as Array<{ full_name: string }>;
    expect(row.full_name).toBe('Bob Developer');
  });

  it('prevents the demo user from deleting its profile (cascade wipe)', async () => {
    const demo = await signIn(USERS.demo);
    const del = await rest(`profiles?id=eq.${demo.id}`, demo.token, { method: 'DELETE' });
    expect(await pgErrorCode(del)).toBe('42501');
    const projects = (await (await rest('projects?select=id', demo.token)).json()) as unknown[];
    expect(projects.length).toBeGreaterThan(0);
  });
});

describe('SEC-2 AI optimize is scoped to the caller project', () => {
  it("returns 404 for another user's test case and leaves it untouched", async () => {
    const alice = await signIn(USERS.alice);
    const [aliceCase] = (await (
      await rest('test_cases?select=id,title,updated_at&limit=1', alice.token)
    ).json()) as Array<{ id: string; title: string; updated_at: string }>;
    expect(aliceCase).toBeDefined();

    await withBobProject('SEC-2 integration', async (projectId, token) => {
      const res = await api(`/projects/${projectId}/ai/optimize/${aliceCase.id}`, token, 'POST', {});
      expect(res.status).toBe(404);
    });

    const [unchanged] = (await (
      await rest(`test_cases?id=eq.${aliceCase.id}&select=title,updated_at`, alice.token)
    ).json()) as Array<{ title: string; updated_at: string }>;
    expect(unchanged).toEqual({ title: aliceCase.title, updated_at: aliceCase.updated_at });
  });

  it('rejects a non-UUID case id with 400', async () => {
    await withBobProject('SEC-2 uuid', async (projectId, token) => {
      const res = await api(`/projects/${projectId}/ai/optimize/not-a-uuid`, token, 'POST', {});
      expect(res.status).toBe(400);
    });
  });
});

describe('CON-1 test-case writes enforce the step contract', () => {
  it('rejects a legacy free-text step with a field-level 400 and accepts a valid one', async () => {
    await withBobProject('con1-contract', async (projectId, token) => {
      const suiteRes = await api(`/projects/${projectId}/test-suites`, token, 'POST', { name: 'contract' });
      expect(suiteRes.status).toBe(201);
      const sid = ((await suiteRes.json()) as { suite: { id: string } }).suite.id;
      const casesPath = `/projects/${projectId}/test-suites/${sid}/test-cases`;

      const legacy = await api(casesPath, token, 'POST', {
        title: 'legacy',
        steps: [{ step_number: 1, instruction: 'Click the login button' }],
      });
      expect(legacy.status).toBe(400);
      const err = (await legacy.json()) as { error: { details: { steps: Record<string, { action?: unknown }> } } };
      expect(err.error.details.steps['0'].action).toBeDefined();

      const missingValue = await api(casesPath, token, 'POST', {
        title: 'fill without value',
        steps: [{ step_number: 1, action: 'fill', instruction: 'Type email', selector: '#email' }],
      });
      expect(missingValue.status).toBe(400);

      const ok = await api(casesPath, token, 'POST', {
        title: 'valid',
        steps: [
          { step_number: 1, action: 'navigate', instruction: 'Open login', value: '/login' },
          { step_number: 2, action: 'click', instruction: 'Submit', selector: '#go', value: '' },
        ],
      });
      expect(ok.status).toBe(201);
      const saved = (await ok.json()) as { test_case: { steps: { action: string; value?: string }[] } };
      expect(saved.test_case.steps.map((s) => s.action)).toEqual(['navigate', 'click']);
      expect(saved.test_case.steps[1].value).toBeUndefined();
    });
  });
});

/** Serves a page with a heading on 127.0.0.1 for the duration of `fn`. */
async function withFixturePage(fn: (baseUrl: string) => Promise<void>) {
  const page = http.createServer((_req, res) => res.writeHead(200, { 'Content-Type': 'text/html' }).end('<h1>Hello fixture</h1>'));
  await new Promise<void>((r) => page.listen(0, '127.0.0.1', r));
  try {
    await fn(`http://127.0.0.1:${(page.address() as AddressInfo).port}/`);
  } finally {
    await new Promise<void>((r) => page.close(() => r()));
  }
}

/** Screenshots stored for each run. */
const screenshotsOf = (runIds: string[]) =>
  Promise.all(runIds.map(async (id) => ((await supabase.storage.from('test-artifacts').list(`screenshots/${id}`)).data ?? []).length));

/**
 * A project with one finished run and one still in progress (its second step waits for an element that never comes),
 * each with a screenshot stored (G2, G10).
 */
async function projectWithRuns(token: string, baseUrl: string) {
  const projectId = ((await (await api('/projects', token, 'POST', { name: 'runs', base_url: baseUrl })).json()) as { project: { id: string } }).project.id;
  const suiteId = ((await (await api(`/projects/${projectId}/test-suites`, token, 'POST', { name: 's' })).json()) as { suite: { id: string } }).suite.id;
  const newCase = async (steps: unknown[]) =>
    ((await (await api(`/projects/${projectId}/test-suites/${suiteId}/test-cases`, token, 'POST', { title: `c${Date.now()}`, steps })).json()) as { test_case: { id: string } }).test_case.id;
  const startRun = async (caseId: string) =>
    ((await (await api(`/projects/${projectId}/test-runs`, token, 'POST', { test_case_id: caseId, mode: 'ai_driven' })).json()) as { test_run: { id: string } }).test_run.id;
  const detail = async (runId: string) => (await (await api(`/projects/${projectId}/test-runs/${runId}`, token)).json()) as { test_run: { status: string }; steps: unknown[] };
  const heading = { step_number: 1, action: 'assert_text', instruction: 'Heading', selector: 'h1', value: 'Hello' };

  const finished = await startRun(await newCase([heading]));
  for (let i = 0; i < 120 && ['pending', 'running'].includes((await detail(finished)).test_run.status); i++) await new Promise((r) => setTimeout(r, 250));
  const inProgress = await startRun(await newCase([heading, { step_number: 2, action: 'assert_visible', instruction: 'Never there', selector: '#never' }]));
  for (let i = 0; i < 120 && (await detail(inProgress)).steps.length < 1; i++) await new Promise((r) => setTimeout(r, 250));
  expect((await detail(inProgress)).test_run.status).toBe('running');
  expect(await screenshotsOf([finished, inProgress])).toEqual([1, 1]);
  return { projectId, suiteId, runs: [finished, inProgress] };
}

describe('G11 runs are Chromium only', () => {
  it('refuses a run in a browser production cannot start; a run naming none is Chromium', async () => {
    await withBobProject('g11', async (projectId, token) => {
      const suite = ((await (await api(`/projects/${projectId}/test-suites`, token, 'POST', { name: 's' })).json()) as { suite: { id: string } }).suite;
      const tc = ((await (await api(`/projects/${projectId}/test-suites/${suite.id}/test-cases`, token, 'POST', {
        title: 'c',
        steps: [{ step_number: 1, action: 'assert_visible', instruction: 'Heading', selector: 'h1' }],
      })).json()) as { test_case: { id: string } }).test_case;
      for (const browser of ['firefox', 'webkit']) {
        const refused = await api(`/projects/${projectId}/test-runs`, token, 'POST', { test_case_id: tc.id, mode: 'ai_driven', browser });
        expect(refused.status, browser).toBe(400);
      }
      const run = await api(`/projects/${projectId}/test-runs`, token, 'POST', { test_case_id: tc.id, mode: 'ai_driven' });
      expect(run.status).toBe(201);
      expect(((await run.json()) as { test_run: { browser: string } }).test_run.browser).toBe('chromium');
    });
  });
});

describe('G10 deleting a project', () => {
  it('stops its run in progress and removes its screenshots', async () => {
    const bob = await signIn(USERS.bob);
    await withFixturePage(async (baseUrl) => {
      const { projectId, runs } = await projectWithRuns(bob.token, baseUrl);
      expect((await api(`/projects/${projectId}`, bob.token, 'DELETE')).status).toBe(200);
      expect(stopRun(runs[1])).toBe(false);
      expect(await screenshotsOf(runs)).toEqual([0, 0]);
      expect((await supabase.from('test_runs').select('id').eq('project_id', projectId)).data).toEqual([]);
    });
  }, 90_000);
});

describe('G2 delete your own account', () => {
  it('deletes the account, its data and screenshots, stopping a run in progress; touches no one else; refuses the demo', async () => {
    const user = { email: `g2-${Date.now()}@qaforge.dev`, password: 'Password123!' };
    const { data: created, error: createError } = await supabase.auth.admin.createUser({ ...user, email_confirm: true });
    expect(createError).toBeNull();
    const userId = created.user!.id;
    try {
      await withFixturePage(async (baseUrl) => {
        const { token } = await signIn(user);
        const bob = await signIn(USERS.bob);
        const bobProjects = async () => (await supabase.from('projects').select('id', { count: 'exact', head: true }).eq('user_id', bob.id)).count;
        const bobBefore = await bobProjects();

        const { projectId, suiteId, runs } = await projectWithRuns(token, baseUrl);
        const secret = ((await (await api(`/projects/${projectId}/tokens`, token, 'POST', { name: 'ci' })).json()) as { secret: string }).secret;

        expect((await api('/auth/me', token, 'DELETE')).status).toBe(204);

        // The run in progress was stopped and waited for, so neither run left a screenshot behind.
        expect(stopRun(runs[1])).toBe(false);
        expect(await screenshotsOf(runs)).toEqual([0, 0]);
        expect((await supabase.auth.admin.getUserById(userId)).data.user).toBeNull();
        for (const [table, column] of [['profiles', 'id'], ['projects', 'user_id'], ['test_runs', 'user_id'], ['project_tokens', 'user_id']]) {
          expect((await supabase.from(table).select('id').eq(column, userId)).data, table).toEqual([]);
        }
        // Its session and its CI token open nothing any more; no one else's data went with it.
        expect((await api('/auth/me', token)).status).toBe(401);
        expect((await api(`/ci/suites/${suiteId}/run`, secret, 'POST', {})).status).toBe(401);
        expect(await bobProjects()).toBe(bobBefore);

        // The demo account is shared by every visitor: it cannot be deleted.
        const demo = await signIn(USERS.demo);
        expect((await api('/auth/me', demo.token, 'DELETE')).status).toBe(403);
      });
    } finally {
      await supabase.auth.admin.deleteUser(userId); // no-op once the test has deleted it
    }
  }, 90_000);
});
