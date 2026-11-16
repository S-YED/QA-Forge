/**
 * F5 project overview: the numbers come from the database functions of migration 30 and match seeded
 * runs, the owner alone can read them, and a browser role cannot call the functions directly.
 * Prereq: local Supabase with migration 30. Runs are inserted as rows; no browser is started.
 */
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { supabase } from '../../config/supabase.js';
import { ANON_KEY, SUPABASE_URL, USERS, signIn, useApi } from './helpers.js';

const api = useApi();
const HOUR = 3_600_000;
const DAY = 24 * HOUR;
const STEP = [{ step_number: 1, action: 'assert_visible', instruction: 'Heading', selector: 'h1' }];

let token = '';
let projectId = '';
const caseIds: Record<string, string> = {};

type Overview = {
  available: boolean;
  passed_30d: number;
  failed_30d: number;
  runs_30d: number;
  days: { day: string; passed: number; failed: number; other: number }[];
  cases: { test_case_id: string; title: string; suite_name: string; status: string; run_id: string; unstable: boolean }[];
};

beforeAll(async () => {
  const bob = await signIn(USERS.bob);
  token = bob.token;
  const project = (await (await api('/projects', token, 'POST', { name: 'f5-overview' })).json()) as { project: { id: string } };
  projectId = project.project.id;
  const suite = (await (await api(`/projects/${projectId}/test-suites`, token, 'POST', { name: 'health' })).json()) as { suite: { id: string } };
  for (const title of ['A', 'B', 'C']) {
    const created = await api(`/projects/${projectId}/test-suites/${suite.suite.id}/test-cases`, token, 'POST', { title, steps: STEP });
    caseIds[title] = ((await created.json()) as { test_case: { id: string } }).test_case.id;
  }

  const run = (title: string | null, status: string, agoMs: number) => ({
    project_id: projectId,
    user_id: bob.id,
    test_case_id: title ? caseIds[title] : null,
    status,
    mode: 'ai_driven',
    created_at: new Date(Date.now() - agoMs).toISOString(),
  });
  const { error } = await supabase.from('test_runs').insert([
    run('A', 'passed', 5 * DAY), // A flips: passed, failed, passed
    run('A', 'failed', 4 * DAY),
    run('A', 'passed', 2 * HOUR),
    run('B', 'failed', 2 * DAY), // B fails steadily
    run('B', 'failed', 3 * HOUR),
    run('C', 'passed', 40 * DAY), // older than the 30-day window
    run(null, 'error', HOUR), // the latest run; no verdict
  ]);
  expect(error).toBeNull();
}, 60_000);

afterAll(async () => {
  if (projectId) await api(`/projects/${projectId}`, token, 'DELETE');
});

describe('F5 project overview', () => {
  it('counts verdicts over 30 days and fills 14 days, oldest first', async () => {
    const res = await api(`/projects/${projectId}/overview?tz=UTC`, token);
    expect(res.status).toBe(200);
    const o = (await res.json()) as Overview;
    expect(o).toMatchObject({ available: true, passed_30d: 2, failed_30d: 3, runs_30d: 6 });

    expect(o.days).toHaveLength(14);
    expect(o.days[13].day).toBe(new Date().toISOString().slice(0, 10));
    expect([...o.days].sort((a, b) => a.day.localeCompare(b.day))).toEqual(o.days);
    const sum = (k: 'passed' | 'failed' | 'other') => o.days.reduce((n, d) => n + d[k], 0);
    expect([sum('passed'), sum('failed'), sum('other')]).toEqual([2, 3, 1]);
  });

  it('gives the last result of each case and marks the one that flips', async () => {
    const o = (await (await api(`/projects/${projectId}/overview`, token)).json()) as Overview;
    const byTitle = Object.fromEntries(o.cases.map((c) => [c.title, c]));
    expect(byTitle.A).toMatchObject({ test_case_id: caseIds.A, suite_name: 'health', status: 'passed', unstable: true });
    expect(byTitle.B).toMatchObject({ status: 'failed', unstable: false });
    expect(byTitle.C).toMatchObject({ status: 'passed', unstable: false });
    // The run it points to is that case's newest one.
    const { data: newest } = await supabase.from('test_runs').select('id').eq('test_case_id', caseIds.A).order('created_at', { ascending: false }).limit(1).single();
    expect(byTitle.A.run_id).toBe(newest!.id);
  });

  it('puts the same health on the project list, and exact totals on the project', async () => {
    const list = (await (await api('/projects', token)).json()) as { projects: { id: string; health: Record<string, unknown> | null }[] };
    expect(list.projects.find((p) => p.id === projectId)!.health).toMatchObject({ passed_30d: 2, failed_30d: 3, last_status: 'error' });

    const detail = (await (await api(`/projects/${projectId}`, token)).json()) as { stats: unknown };
    expect(detail.stats).toEqual({ total_runs: 7, passed_runs: 3, failed_runs: 3 });
  });

  it('falls back to UTC for a timezone it does not know, and uses a real one', async () => {
    expect((await api(`/projects/${projectId}/overview?tz=Not/AZone`, token)).status).toBe(200);
    const o = (await (await api(`/projects/${projectId}/overview?tz=Pacific/Kiritimati`, token)).json()) as Overview;
    expect(o.days).toHaveLength(14);
    expect(o.passed_30d).toBe(2);
  });

  it('another user cannot read it, and a signed-in browser cannot call the functions itself', async () => {
    const alice = await signIn(USERS.alice);
    expect((await api(`/projects/${projectId}/overview`, alice.token)).status).toBe(404);

    for (const [fn, args] of [
      ['project_overview', { p_project_id: projectId }],
      ['projects_health', { p_user_id: alice.id }],
    ] as const) {
      const direct = await fetch(`${SUPABASE_URL}/rest/v1/rpc/${fn}`, {
        method: 'POST',
        headers: { apikey: ANON_KEY, Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
        body: JSON.stringify(args),
      });
      expect(direct.ok).toBe(false);
    }
  });
});
