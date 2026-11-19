/**
 * DEMO-1 (owner's decisions 1A and 2A): with DEMO_SHOP_URL set, the demo account gets one "Demo shop" project made
 * from the local demo cases, with a daily schedule that is due at once. Calling it again keeps one project and only
 * moves its address. A suite run as the demo account (which visitors can never write as) runs every case against the
 * shop: eleven pass and the planted coupon bug fails, with a bug filed.
 * Prereq: local Supabase with the seed's demo account, and Playwright Chromium.
 */
import { spawn, type ChildProcess } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { supabase } from '../../config/supabase.js';
import { DEMO_SHOP_NAME, ensureDemoShop, pruneDemoHistory } from '../../services/demo-shop.js';
import { readSuiteRun, startSuiteRun } from '../../services/suite-runs.js';
import { ARTIFACT_BUCKET, removeScreenshots, screenshotPath, screenshotsOfRuns } from '../../utils/artifacts.js';
import { USERS } from './helpers.js';

let shop: ChildProcess;
let shopUrl: string;
let demoId: string;
let projectId: string | null = null;

beforeAll(async () => {
  const server = fileURLToPath(new URL('../../../../demo-app/server.mjs', import.meta.url));
  shop = spawn(process.execPath, [server], { env: { ...process.env, PORT: '0' } });
  shopUrl = await new Promise<string>((resolve, reject) => {
    shop.stdout!.on('data', (d: Buffer) => {
      const m = /listening on (http:\/\/\S+)/.exec(String(d));
      if (m) resolve(`${m[1]}/`);
    });
    shop.once('exit', (code) => reject(new Error(`demo shop exited with ${code}`)));
  });
  const { data } = await supabase.from('profiles').select('id').eq('is_demo', true).single();
  demoId = data!.id;
});

afterAll(async () => {
  if (projectId) {
    await removeScreenshots(await screenshotsOfRuns('project_id', projectId));
    await supabase.from('projects').delete().eq('id', projectId);
  }
  shop?.kill();
});

describe('DEMO-1 demo shop project', () => {
  it('does nothing without an address', async () => {
    expect(await ensureDemoShop('')).toBeNull();
  });

  it('makes one project with a daily schedule, moves it to a new address, and its suite run runs every case', async () => {
    projectId = await ensureDemoShop('https://shop.example.test/');
    expect(projectId).toBeTruthy();

    const { data: suites } = await supabase
      .from('test_suites')
      .select('id, name, parent_suite_id')
      .eq('project_id', projectId!)
      .order('created_at', { ascending: true });
    const parent = suites!.find((s) => !s.parent_suite_id)!;
    expect(suites!.filter((s) => s.parent_suite_id === parent.id).map((s) => s.name)).toEqual(['Sign in', 'Registration', 'Shopping list', 'Checkout']);
    const { count: cases } = await supabase.from('test_cases').select('id', { count: 'exact', head: true }).in('suite_id', suites!.map((s) => s.id));
    expect(cases).toBe(12);

    const { data: schedule } = await supabase.from('suite_schedules').select('frequency, enabled, next_run_at, user_id').eq('suite_id', parent.id).single();
    expect(schedule).toMatchObject({ frequency: 'daily', enabled: true, user_id: demoId });
    expect(new Date(schedule!.next_run_at).getTime()).toBeLessThanOrEqual(Date.now()); // first run on the next tick

    // Again, with the shop's real address: the same project, moved there, nothing duplicated.
    expect(await ensureDemoShop(shopUrl)).toBe(projectId);
    const { data: named } = await supabase.from('projects').select('id, base_url').eq('user_id', demoId).eq('name', DEMO_SHOP_NAME);
    expect(named).toEqual([{ id: projectId, base_url: shopUrl }]);
    const { count: casesAfter } = await supabase.from('test_cases').select('id', { count: 'exact', head: true }).in('suite_id', suites!.map((s) => s.id));
    expect(casesAfter).toBe(12);

    // The scheduler starts exactly this: the parent's suite run, as the demo account.
    const { batchId } = await startSuiteRun(undefined, demoId, projectId!, parent.id);
    const deadline = Date.now() + 180_000;
    let run = await readSuiteRun(batchId, projectId!);
    while (run!.counts.pending + run!.counts.running > 0) {
      if (Date.now() > deadline) throw new Error(`demo suite run still active: ${JSON.stringify(run!.counts)}`);
      await new Promise((r) => setTimeout(r, 1000));
      run = await readSuiteRun(batchId, projectId!);
    }
    expect(run!.counts).toMatchObject({ total: 12, passed: 11, failed: 1, error: 0 });
    const failed = run!.runs.find((r) => r.status === 'failed')!;
    // supabase-js types the joined row as an array; it is one object here
    expect((failed.test_cases as unknown as { title: string } | null)?.title).toBe('Coupon SAVE10 takes 10% off the total');
    const { count: bugs } = await supabase.from('bugs').select('id', { count: 'exact', head: true }).eq('test_run_id', failed.id);
    expect(bugs).toBe(1);
  }, 240_000);

  it('keeps 30 days of demo suite runs: older ones go with their bugs and screenshots, nothing else is touched', async () => {
    const now = new Date();
    const daysAgo = (n: number) => new Date(now.getTime() - n * 86_400_000).toISOString();
    const { data: bob } = await supabase.from('profiles').select('id').eq('email', USERS.bob.email).single();
    const { data: bobProject } = await supabase.from('projects').insert({ user_id: bob!.id, name: 'demo-1 prune (bob)' }).select('id').single();
    const bucket = () => supabase.storage.from(ARTIFACT_BUCKET);

    /** A failed run `age` days old (in a suite run unless `inBatch` is false) with a step screenshot and a bug. */
    async function failedRun(userId: string, project: string, age: number, inBatch = true) {
      const batch = inBatch
        ? (await supabase.from('run_batches').insert({ project_id: project, user_id: userId, created_at: daysAgo(age) }).select('id').single()).data!.id
        : null;
      const { data: run } = await supabase
        .from('test_runs')
        .insert({ project_id: project, user_id: userId, batch_id: batch, mode: 'ai_driven', status: 'failed', created_at: daysAgo(age) })
        .select('id')
        .single();
      const shot = screenshotPath(run!.id, 1);
      expect((await bucket().upload(shot, Buffer.from('png'), { contentType: 'image/png' })).error).toBeNull();
      await supabase.from('test_steps').insert({ test_run_id: run!.id, step_number: 1, action: 'click', status: 'failed', screenshot_url: shot });
      const { data: bug } = await supabase.from('bugs').insert({ project_id: project, test_run_id: run!.id, title: 'old failure' }).select('id').single();
      return { batch, run: run!.id, shot, bug: bug!.id };
    }
    const exists = async (table: 'run_batches' | 'test_runs' | 'bugs', id: string | null) =>
      !!id && !!(await supabase.from(table).select('id').eq('id', id).maybeSingle()).data;
    const shotExists = async (path: string) =>
      ((await bucket().list(path.split('/').slice(0, -1).join('/'))).data ?? []).some((f) => f.name === path.split('/').pop());

    try {
      const expired = await failedRun(demoId, projectId!, 31);
      const recent = await failedRun(demoId, projectId!, 29);
      const seeded = await failedRun(demoId, projectId!, 200, false); // a seeded showcase run is not a suite run
      const bobs = await failedRun(bob!.id, bobProject!.id, 31);

      expect(await pruneDemoHistory(now)).toBe(1);
      expect(await exists('run_batches', expired.batch)).toBe(false);
      expect(await exists('test_runs', expired.run)).toBe(false);
      expect(await exists('bugs', expired.bug)).toBe(false);
      expect(await shotExists(expired.shot)).toBe(false);
      for (const kept of [recent, seeded, bobs]) {
        expect(await exists('test_runs', kept.run)).toBe(true);
        expect(await exists('bugs', kept.bug)).toBe(true);
        expect(await shotExists(kept.shot)).toBe(true);
      }
      expect(await exists('run_batches', bobs.batch)).toBe(true);
    } finally {
      await removeScreenshots(await screenshotsOfRuns('project_id', bobProject!.id));
      await supabase.from('projects').delete().eq('id', bobProject!.id);
    }
  }, 60_000);
});
