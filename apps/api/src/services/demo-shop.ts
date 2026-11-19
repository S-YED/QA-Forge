// DEMO-1 (owner's decisions 1A and 2A, 19 Nov): the read-only demo shows a project that really runs. With
// DEMO_SHOP_URL set, the demo account gets a "Demo shop" project for that address, made from the local demo cases
// (twelve: eleven pass, the planted coupon bug fails), and a daily suite run keeps its history current.
// Unset, nothing happens, so production changes only once the owner sets it.
import { localDemoTestCases } from '@qaforge/ai-engine';
import type { GeneratedTestCase } from '@qaforge/shared-types';
import { env } from '../config/env.js';
import { supabase } from '../config/supabase.js';
import { removeScreenshots, screenshotsOfRuns } from '../utils/artifacts.js';
import logger from '../utils/logger.js';
import type { ScheduleRule } from './schedules.js';

export const DEMO_SHOP_NAME = 'Demo shop';
/** The parent suite keeps the not-found case; running it runs every sub-suite too (G4). */
const PARENT = { name: 'Daily check', words: '404' };
/** Each sub-suite holds the demo cases its words select. */
const AREAS = [
  { name: 'Sign in', words: 'login' },
  { name: 'Registration', words: 'register' },
  { name: 'Shopping list', words: 'item' },
  { name: 'Checkout', words: 'checkout' },
];
export const DEMO_SHOP_SCHEDULE: ScheduleRule = { frequency: 'daily', hour: 6, timezone: 'UTC' };

async function addSuite(projectId: string, name: string, description: string | null, parentId: string | null): Promise<string> {
  const { data, error } = await supabase
    .from('test_suites')
    .insert({ project_id: projectId, parent_suite_id: parentId, name, description })
    .select('id')
    .single();
  if (error || !data) throw error ?? new Error(`suite ${name} not created`);
  return data.id;
}

async function addCases(suiteId: string, cases: GeneratedTestCase[]): Promise<void> {
  const base = Date.now(); // 1 ms apart, so a suite run keeps the cases in this order
  const { error } = await supabase.from('test_cases').insert(
    cases.map((c, i) => ({
      suite_id: suiteId,
      title: c.title,
      description: c.description,
      steps: c.steps,
      expected_result: c.expected_result,
      priority: c.priority,
      type: c.type,
      tags: c.tags,
      created_at: new Date(base + i).toISOString(),
    })),
  );
  if (error) throw error;
}

/**
 * Make sure the demo account has the demo shop project for `url`: made once, later calls only move it to a new
 * address. Returns the project id, or null with no address or no demo account.
 * ponytail: check, then create; two API instances starting at the same moment could both create it (one runs today).
 */
export async function ensureDemoShop(url = env.DEMO_SHOP_URL): Promise<string | null> {
  if (!url) return null;
  const { data: demo, error: demoError } = await supabase.from('profiles').select('id').eq('is_demo', true).limit(1).maybeSingle();
  if (demoError) throw demoError;
  if (!demo) return null;

  const { data: existing, error: findError } = await supabase
    .from('projects')
    .select('id, base_url')
    .eq('user_id', demo.id)
    .eq('name', DEMO_SHOP_NAME)
    .maybeSingle();
  if (findError) throw findError;
  if (existing) {
    if (existing.base_url !== url) {
      const { error } = await supabase.from('projects').update({ base_url: url }).eq('id', existing.id);
      if (error) throw error;
    }
    return existing.id;
  }

  const { data: project, error: projectError } = await supabase
    .from('projects')
    .insert({
      user_id: demo.id,
      name: DEMO_SHOP_NAME,
      description: 'A small online shop that QA Forge tests every morning. Its coupon has a planted bug, so one case fails on purpose.',
      base_url: url,
    })
    .select('id')
    .single();
  if (projectError || !project) throw projectError ?? new Error('demo shop project not created');
  try {
    const parent = await addSuite(project.id, PARENT.name, 'Every case, every morning. Running it runs its sub-suites too.', null);
    await addCases(parent, localDemoTestCases(PARENT.words));
    for (const area of AREAS) await addCases(await addSuite(project.id, area.name, null, parent), localDemoTestCases(area.words));
    // Due now, so the first suite run starts on the scheduler's next check; then once a day.
    const { error } = await supabase
      .from('suite_schedules')
      .insert({ project_id: project.id, suite_id: parent, user_id: demo.id, ...DEMO_SHOP_SCHEDULE, enabled: true, next_run_at: new Date().toISOString() });
    if (error) throw error;
  } catch (err) {
    await supabase.from('projects').delete().eq('id', project.id); // never leave half a project behind
    throw err;
  }
  logger.info({ event: 'demo:shop_created', projectId: project.id, url });
  return project.id;
}

/**
 * Keep the demo's last `days` days of suite runs: older suite runs of a demo account go, with their runs, bugs and
 * screenshots, so the daily run does not fill storage. Seeded runs are not suite runs and stay; no other account is
 * touched. Returns how many suite runs were removed (at most 50 a call; a backlog clears over later calls).
 */
export async function pruneDemoHistory(now = new Date(), days = 30): Promise<number> {
  const cutoff = new Date(now.getTime() - days * 86_400_000).toISOString();
  const { data: demos, error: demoError } = await supabase.from('profiles').select('id').eq('is_demo', true);
  if (demoError) throw demoError;
  if (!demos?.length) return 0;

  const { data: old, error: oldError } = await supabase
    .from('run_batches')
    .select('id')
    .in('user_id', demos.map((d) => d.id))
    .lt('created_at', cutoff)
    .limit(50);
  if (oldError) throw oldError;
  for (const batch of old ?? []) {
    const shots = await screenshotsOfRuns('batch_id', batch.id); // read before the steps cascade away
    const { data: runs, error: runsError } = await supabase.from('test_runs').select('id').eq('batch_id', batch.id);
    if (runsError) throw runsError;
    const runIds = (runs ?? []).map((r) => r.id);
    if (runIds.length) {
      // A bug only loses its run link when the run goes, so the demo's old bugs are removed here.
      const { error: bugsError } = await supabase.from('bugs').delete().in('test_run_id', runIds);
      if (bugsError) throw bugsError;
      const { error: deleteError } = await supabase.from('test_runs').delete().in('id', runIds);
      if (deleteError) throw deleteError;
    }
    const { error: batchError } = await supabase.from('run_batches').delete().eq('id', batch.id);
    if (batchError) throw batchError;
    await removeScreenshots(shots);
  }
  return old?.length ?? 0;
}
