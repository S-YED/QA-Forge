/**
 * S6 (migration 25) against real local Supabase:
 *  - through PostgREST a user cannot point a run in their own project at another user's case;
 *  - deleting a profile un-assigns its bugs (they stay, assigned_to becomes NULL).
 */
import { describe, expect, it } from 'vitest';
import { ANON_KEY, SUPABASE_URL, USERS, signIn, useApi } from './helpers.js';
import { supabase } from '../../config/supabase.js';

const api = useApi();

const rest = (path: string, token: string, body: unknown) =>
  fetch(`${SUPABASE_URL}/rest/v1/${path}`, {
    method: 'POST',
    headers: { apikey: ANON_KEY, Authorization: `Bearer ${token}`, 'Content-Type': 'application/json', Prefer: 'return=representation' },
    body: JSON.stringify(body),
  });

async function projectWithCase(token: string, name: string) {
  const project = ((await (await api('/projects', token, 'POST', { name })).json()) as { project: { id: string } }).project.id;
  const suite = ((await (await api(`/projects/${project}/test-suites`, token, 'POST', { name: 's' })).json()) as { suite: { id: string } }).suite.id;
  const created = await api(`/projects/${project}/test-suites/${suite}/test-cases`, token, 'POST', {
    title: 'c',
    steps: [{ step_number: 1, action: 'navigate', instruction: 'Open', value: '/' }],
  });
  const body = (await created.json()) as { test_case?: { id: string } };
  expect(created.status, JSON.stringify(body)).toBe(201);
  const caseId = body.test_case!.id;
  expect(caseId).toMatch(/^[0-9a-f-]{36}$/); // a missing id would silently mean "no case", which is allowed
  return { project, caseId };
}

describe('S6 test_runs reference a case of their own project', () => {
  // The attacker is bob, a regular tester: alice is an admin in the seed and admins bypass RLS by design.
  it("refuses a run that points at another user's case, allows one with an own case", async () => {
    const bob = await signIn(USERS.bob);
    const alice = await signIn(USERS.alice);
    const mine = await projectWithCase(bob.token, 's6-bob');
    const theirs = await projectWithCase(alice.token, 's6-alice');
    try {
      const stolen = await rest('test_runs', bob.token, {
        project_id: mine.project,
        test_case_id: theirs.caseId,
        user_id: bob.id,
        mode: 'ai_driven',
        status: 'pending',
      });
      expect(stolen.status).toBe(403);
      expect(((await stolen.json()) as { code: string }).code).toBe('42501');

      const own = await rest('test_runs', bob.token, {
        project_id: mine.project,
        test_case_id: mine.caseId,
        user_id: bob.id,
        mode: 'ai_driven',
        status: 'pending',
      });
      expect(own.status).toBe(201);
    } finally {
      await api(`/projects/${mine.project}`, bob.token, 'DELETE');
      await api(`/projects/${theirs.project}`, alice.token, 'DELETE');
    }
  });
});

describe('S6 deleting a profile un-assigns its bugs', () => {
  it('keeps the bug and sets assigned_to to NULL', async () => {
    const alice = await signIn(USERS.alice);
    const { project } = await projectWithCase(alice.token, 's6-assignee');
    const { data: temp, error } = await supabase.auth.admin.createUser({
      email: `s6-${Date.now()}@qaforge.dev`,
      password: 'Password123!',
      email_confirm: true,
    });
    expect(error).toBeNull();
    try {
      const { data: bug } = await supabase
        .from('bugs')
        .insert({ project_id: project, title: 's6 bug', severity: 'low', status: 'open', assigned_to: temp.user!.id })
        .select('id')
        .single();

      const { error: deleteError } = await supabase.auth.admin.deleteUser(temp.user!.id); // cascades to the profile
      expect(deleteError).toBeNull();

      const { data: after } = await supabase.from('bugs').select('id, assigned_to').eq('id', bug!.id).single();
      expect(after).toEqual({ id: bug!.id, assigned_to: null });
    } finally {
      await api(`/projects/${project}`, alice.token, 'DELETE');
    }
  });
});
