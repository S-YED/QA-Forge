/**
 * F6 find and organise: case search across suites, filters on the run and bug lists, duplicating a case
 * and moving it to another suite. Prereq: local Supabase. Runs and bugs are inserted as rows; no browser.
 */
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { supabase } from '../../config/supabase.js';
import { USERS, signIn, useApi } from './helpers.js';

const api = useApi();
const DAY = 86_400_000;
const step = (instruction: string) => [{ step_number: 1, action: 'assert_visible', instruction, selector: 'h1' }];

let token = '';
let aliceToken = '';
let projectId = '';
let otherProjectId = '';
const suites: Record<string, string> = {};
const cases: Record<string, string> = {};

type Case = { id: string; title: string; suite_id: string; suite_name?: string; steps: unknown[] };
const json = async <T>(res: Response) => (await res.json()) as T;
const casePath = (suite: string, suffix = '') => `/projects/${projectId}/test-suites/${suites[suite]}/test-cases${suffix}`;
const search = async (q: string, auth = token) => api(`/projects/${projectId}/test-suites/search?q=${encodeURIComponent(q)}`, auth);
const titles = async (res: Response) => (await json<{ test_cases: Case[] }>(res)).test_cases.map((c) => c.title).sort();

beforeAll(async () => {
  const bob = await signIn(USERS.bob);
  token = bob.token;
  aliceToken = (await signIn(USERS.alice)).token;
  projectId = (await json<{ project: { id: string } }>(await api('/projects', token, 'POST', { name: 'f6-find' }))).project.id;
  otherProjectId = (await json<{ project: { id: string } }>(await api('/projects', token, 'POST', { name: 'f6-other' }))).project.id;

  for (const name of ['Shop', 'Account']) {
    suites[name] = (await json<{ suite: { id: string } }>(await api(`/projects/${projectId}/test-suites`, token, 'POST', { name }))).suite.id;
  }
  suites.Elsewhere = (await json<{ suite: { id: string } }>(await api(`/projects/${otherProjectId}/test-suites`, token, 'POST', { name: 'Elsewhere' }))).suite.id;

  for (const [suite, title, instruction] of [
    ['Shop', 'Cart total', 'Type the coupon SAVE10'],
    ['Shop', 'Sale shows 50%_off', 'Open the sale page'],
    ['Account', 'Login works', 'Open the login page'],
  ]) {
    const created = await api(casePath(suite), token, 'POST', { title, steps: step(instruction) });
    cases[title] = (await json<{ test_case: { id: string } }>(created)).test_case.id;
  }

  const run = (status: string, agoMs: number) => ({ project_id: projectId, user_id: bob.id, status, mode: 'ai_driven', created_at: new Date(Date.now() - agoMs).toISOString() });
  const bug = (title: string, description: string, severity: string, status: string, agoMs: number) => ({
    project_id: projectId, title, description, severity, status, created_at: new Date(Date.now() - agoMs).toISOString(),
  });
  const seeded = await Promise.all([
    supabase.from('test_runs').insert([run('passed', 0), run('failed', 0), run('failed', 10 * DAY), run('error', 40 * DAY)]),
    supabase.from('bugs').insert([
      bug('Coupon is not applied', 'Total stays at 100, expected 90', 'high', 'open', 0),
      bug('Login button missing', 'Could not find "Sign in" (50% of runs)', 'critical', 'resolved', 0),
      bug('Old layout bug', 'Footer overlaps the cart', 'low', 'open', 20 * DAY),
    ]),
  ]);
  expect(seeded.map((s) => s.error)).toEqual([null, null]);
}, 60_000);

afterAll(async () => {
  for (const id of [projectId, otherProjectId]) if (id) await api(`/projects/${id}`, token, 'DELETE');
});

describe('F6 case search', () => {
  it('finds cases across suites by title or step text, ignoring case, and names the suite', async () => {
    expect(await titles(await search('LOGIN'))).toEqual(['Login works']);
    expect(await titles(await search('save10'))).toEqual(['Cart total']); // in a step, not the title
    const hit = (await json<{ test_cases: Case[] }>(await search('cart'))).test_cases[0];
    expect(hit).toMatchObject({ id: cases['Cart total'], suite_id: suites.Shop, suite_name: 'Shop' });
    expect(await titles(await search('50%_off'))).toEqual(['Sale shows 50%_off']); // % and _ are plain text
    expect(await titles(await search('nothing-like-this'))).toEqual([]);
  });

  it('needs something to search for, and only the owner may search', async () => {
    expect((await api(`/projects/${projectId}/test-suites/search`, token)).status).toBe(400);
    expect((await search('   ')).status).toBe(400);
    expect((await search('cart', aliceToken)).status).toBe(404);
  });
});

describe('F6 list filters', () => {
  const runs = async (qs: string) => api(`/projects/${projectId}/test-runs?${qs}`, token);
  const bugs = async (qs: string) => api(`/projects/${projectId}/bugs?${qs}`, token);
  const count = async (res: Response) => (await json<{ count: number }>(res)).count;

  it('filters runs by status and by age', async () => {
    expect(await count(await runs(''))).toBe(4);
    expect(await count(await runs('status=failed'))).toBe(2);
    expect(await count(await runs('days=7'))).toBe(2);
    expect(await count(await runs('status=failed&days=7'))).toBe(1);
    expect(await count(await runs('days=30&per_page=1'))).toBe(3); // the count is of all matches, not the page
  });

  it('filters bugs by text, status, severity and age', async () => {
    expect(await count(await bugs(''))).toBe(3);
    expect(await count(await bugs('q=coupon'))).toBe(1); // title
    expect(await count(await bugs('q=overlaps'))).toBe(1); // description
    expect(await count(await bugs('status=open'))).toBe(2);
    expect(await count(await bugs('status=open&days=7'))).toBe(1);
    expect(await count(await bugs('severity=critical'))).toBe(1);
    expect(await count(await bugs(`q=${encodeURIComponent('50%')}`))).toBe(1); // % is plain text, not "anything"
    // Filter syntax in the search text stays text: it finds nothing and cannot widen the list.
    expect(await count(await bugs(`q=${encodeURIComponent('x%",id.not.is.null,title.ilike."%')}`))).toBe(0);
  });

  it('refuses values it does not know', async () => {
    expect((await runs('status=exploded')).status).toBe(400);
    expect((await runs('days=0')).status).toBe(400);
    expect((await bugs('status=exploded')).status).toBe(400);
    expect((await bugs('severity=huge')).status).toBe(400);
  });
});

describe('F6 duplicate and move', () => {
  it('duplicates a case into the same suite with the same steps', async () => {
    const res = await api(casePath('Shop', `/${cases['Cart total']}/duplicate`), token, 'POST');
    expect(res.status).toBe(201);
    const copy = (await json<{ test_case: Case }>(res)).test_case;
    expect(copy).toMatchObject({ title: 'Cart total (copy)', suite_id: suites.Shop, steps: step('Type the coupon SAVE10') });
    expect(copy.id).not.toBe(cases['Cart total']);

    expect((await api(casePath('Shop', `/${cases['Cart total']}/duplicate`), aliceToken, 'POST')).status).toBe(404);
    // A case is only reachable through its own suite.
    expect((await api(casePath('Account', `/${cases['Cart total']}/duplicate`), token, 'POST')).status).toBe(404);
  });

  it('moves a case to another suite of the project, and nowhere else', async () => {
    const id = cases['Login works'];
    const moved = await api(casePath('Account', `/${id}`), token, 'PUT', { suite_id: suites.Shop });
    expect(moved.status).toBe(200);
    expect((await json<{ test_case: Case }>(moved)).test_case.suite_id).toBe(suites.Shop);
    expect((await api(casePath('Shop', `/${id}`), token)).status).toBe(200);
    expect((await api(casePath('Account', `/${id}`), token)).status).toBe(404);

    // Not into a suite of another project, even one the same user owns.
    expect((await api(casePath('Shop', `/${id}`), token, 'PUT', { suite_id: suites.Elsewhere })).status).toBe(404);
    expect((await api(casePath('Shop', `/${id}`), aliceToken, 'PUT', { suite_id: suites.Account })).status).toBe(404);
    const { data } = await supabase.from('test_cases').select('suite_id').eq('id', id).single();
    expect(data!.suite_id).toBe(suites.Shop);
  });
});
