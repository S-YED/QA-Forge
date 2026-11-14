/**
 * QA-2 RLS matrix straight through PostgREST (the path a user has with the public key and their
 * own JWT, bypassing the API): for every public table, bob cannot read, update, delete or insert
 * into another user's rows. The victim is a throwaway user, so real seed rows are never touched.
 */
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { supabase as admin } from '../../config/supabase.js';
import { ANON_KEY, SUPABASE_URL, USERS, signIn } from './helpers.js';

type Row = Record<string, unknown>;
const rest = (token: string, method: string, path: string, body?: unknown) =>
  fetch(`${SUPABASE_URL}/rest/v1/${path}`, {
    method,
    headers: { apikey: ANON_KEY, Authorization: `Bearer ${token}`, 'Content-Type': 'application/json', Prefer: 'return=representation' },
    body: body === undefined ? undefined : JSON.stringify(body),
  });

async function insert(table: string, row: Row): Promise<string> {
  const { data, error } = await admin.from(table).insert(row).select('id').single();
  if (error || !data) throw new Error(`seed ${table}: ${error?.message}`);
  return (data as { id: string }).id;
}
const read = async (table: string, id: string) => (await admin.from(table).select('*').eq('id', id).single()).data as Row | null;

/** Every table in `public` (all have RLS enabled); a new table must be added to the matrix. */
const PUBLIC_TABLES = [
  'api_keys', 'app_contexts', 'bugs', 'export_schemas', 'integrations', 'media_attachments', 'profiles', 'projects',
  'recorded_sessions', 'session_actions', 'sprint_changes', 'test_cases', 'test_runs', 'test_steps', 'test_suites',
];

let bob: { token: string; id: string };
let victim = '';
/** table → the victim's row, a change bob tries, and a row bob tries to insert against the victim */
const targets: Record<string, { id: string; patch: Row; intrude?: Row }> = {};

beforeAll(async () => {
  bob = await signIn(USERS.bob);
  const { data, error } = await admin.auth.admin.createUser({ email: `rls-${Date.now()}@qaforge.dev`, password: 'Password123!', email_confirm: true });
  if (error || !data.user) throw new Error(`victim: ${error?.message}`);
  victim = data.user.id; // the profile row comes from the signup trigger

  const project = await insert('projects', { user_id: victim, name: 'rls victim' });
  const suite = await insert('test_suites', { project_id: project, name: 's' });
  const tcase = await insert('test_cases', { suite_id: suite, title: 'c' });
  const run = await insert('test_runs', { project_id: project, user_id: victim, test_case_id: tcase, mode: 'ai_driven' });
  const step = await insert('test_steps', { test_run_id: run, step_number: 1, action: 'navigate', status: 'passed' });
  const bug = await insert('bugs', { project_id: project, title: 'b' });
  const session = await insert('recorded_sessions', { project_id: project, user_id: victim, name: 'r', base_url: 'https://example.com' });
  const sessionAction = await insert('session_actions', { session_id: session, action_number: 1, action_type: 'click', timestamp_ms: 0 });

  Object.assign(targets, {
    profiles: { id: victim, patch: { full_name: 'pwned' } },
    projects: { id: project, patch: { name: 'pwned' }, intrude: { user_id: victim, name: 'x' } },
    test_suites: { id: suite, patch: { name: 'pwned' }, intrude: { project_id: project, name: 'x' } },
    test_cases: { id: tcase, patch: { title: 'pwned' }, intrude: { suite_id: suite, title: 'x' } },
    test_runs: { id: run, patch: { error_message: 'pwned' }, intrude: { project_id: project, user_id: bob.id, mode: 'ai_driven' } },
    test_steps: { id: step, patch: { status: 'failed' }, intrude: { test_run_id: run, step_number: 2, action: 'x', status: 'passed' } },
    bugs: { id: bug, patch: { title: 'pwned' }, intrude: { project_id: project, title: 'x' } },
    recorded_sessions: { id: session, patch: { name: 'pwned' }, intrude: { project_id: project, user_id: bob.id, name: 'x', base_url: 'https://example.com' } },
    session_actions: { id: sessionAction, patch: { action_type: 'hover' }, intrude: { session_id: session, action_number: 2, action_type: 'click', timestamp_ms: 0 } },
    api_keys: { id: await insert('api_keys', { user_id: victim, provider: 'openai', encrypted_key: 'not-a-real-key' }), patch: { key_hint: 'pwned' }, intrude: { user_id: victim, provider: 'gemini', encrypted_key: 'x' } },
    integrations: { id: await insert('integrations', { user_id: victim, provider: 'jira' }), patch: { provider: 'github' }, intrude: { user_id: victim, provider: 'notion' } },
    export_schemas: { id: await insert('export_schemas', { user_id: victim, name: 'e', columns: [] }), patch: { name: 'pwned' }, intrude: { user_id: victim, name: 'x', columns: [] } },
    app_contexts: { id: await insert('app_contexts', { project_id: project, type: 'text', name: 'a' }), patch: { name: 'pwned' }, intrude: { project_id: project, type: 'text', name: 'x' } },
    sprint_changes: { id: await insert('sprint_changes', { project_id: project, user_id: victim, changes_description: 'd' }), patch: { changes_description: 'pwned' }, intrude: { project_id: project, user_id: bob.id, changes_description: 'x' } },
    media_attachments: { id: await insert('media_attachments', { entity_type: 'bug', entity_id: bug, type: 'log', file_url: 'https://example.com/a.log' }), patch: { file_url: 'https://example.com/pwned' }, intrude: { entity_type: 'bug', entity_id: bug, type: 'log', file_url: 'https://example.com/x' } },
  });
}, 60_000);

afterAll(async () => {
  if (targets.media_attachments) await admin.from('media_attachments').delete().eq('id', targets.media_attachments.id); // no FK, no cascade
  if (victim) await admin.auth.admin.deleteUser(victim); // cascades to every other row above
});

describe("QA-2 RLS: bob cannot touch another user's rows through PostgREST", () => {
  it('covers every public table', () => {
    expect(Object.keys(targets).sort()).toEqual([...PUBLIC_TABLES].sort());
  });

  it('refuses read, update, delete and insert on each table, and the rows are unchanged', async () => {
    const leaks: string[] = [];
    for (const [table, { id, patch, intrude }] of Object.entries(targets)) {
      const before = await read(table, id);
      if (!before) leaks.push(`${table}: seed row missing`);
      const seen = (await (await rest(bob.token, 'GET', `${table}?id=eq.${id}`)).json()) as Row[];
      if (seen.length) leaks.push(`${table}: read`);
      const updated = await rest(bob.token, 'PATCH', `${table}?id=eq.${id}`, patch);
      if (updated.ok && ((await updated.json()) as Row[]).length) leaks.push(`${table}: update`);
      const deleted = await rest(bob.token, 'DELETE', `${table}?id=eq.${id}`);
      if (deleted.ok && ((await deleted.json()) as Row[]).length) leaks.push(`${table}: delete`);
      if (intrude) {
        const inserted = await rest(bob.token, 'POST', table, intrude);
        if (inserted.ok) leaks.push(`${table}: insert -> ${inserted.status}`);
      }
      if (JSON.stringify(await read(table, id)) !== JSON.stringify(before)) leaks.push(`${table}: row changed`);
    }
    expect(leaks).toEqual([]);
  });
});
