/**
 * Security regression tests against a real local Supabase + in-process API.
 * Prereq: `supabase start && supabase db reset` (seed users alice/bob/demo).
 *
 * SEC-1: profiles column lockdown (migration 22) — no self-escalation to admin,
 *        demo user cannot delete its profile.
 * SEC-2: AI optimize cannot read/overwrite another user's test case (IDOR).
 * CON-1: test-case writes enforce the shared step contract with field-level 400s.
 */
import { describe, expect, it } from 'vitest';
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
