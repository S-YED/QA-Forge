import type { Server } from 'socket.io';
import { AppError } from '../middleware/error-handler.js';
import { supabase } from '../config/supabase.js';
import logger from '../utils/logger.js';
import { executeBatch } from './run-executor.js';
import { notifySuiteRun } from './notifications.js';

// F3/F8: starting and reading a suite run. Shared by the signed-in routes (run-batches) and the
// token routes (ci), so a run started from CI is exactly a run started from the web app.

/** A suite run is capped so one request cannot queue hours of browser time. */
export const MAX_CASES = 50;

/** Postgres/PostgREST codes for "table or column missing": migration 26 has not been applied yet. */
const NOT_MIGRATED = ['42P01', '42703', 'PGRST204', 'PGRST205'];
export const isNotMigrated = (error: { code?: string } | null) => !!error && NOT_MIGRATED.includes(error.code ?? '');
const notMigrated = () =>
  new AppError('NOT_AVAILABLE', 503, 'Suite runs are not available yet: the database is missing migration 26.');
const dbError = (error: { code?: string } | null, fallback: string) =>
  isNotMigrated(error) ? notMigrated() : (error ?? new AppError('INTERNAL_ERROR', 500, fallback));

/**
 * Queue one run per case of the suite and its sub-suites and start executing them in order. The caller has already
 * established that `userId` may act on `projectId`; the suite must belong to that project.
 */
export async function startSuiteRun(
  io: Server | undefined,
  userId: string,
  projectId: string,
  suiteId: string,
  { scheduled = false }: { scheduled?: boolean } = {},
): Promise<{ batchId: string; runIds: string[] }> {
  const { data: suite } = await supabase
    .from('test_suites')
    .select('id')
    .eq('id', suiteId)
    .eq('project_id', projectId)
    .maybeSingle();
  if (!suite) throw new AppError('NOT_FOUND', 404, 'Suite not found');

  // G6: without a base URL every case would stop at once with the same error; say so before queuing any.
  const { data: project, error: projectError } = await supabase.from('projects').select('base_url').eq('id', projectId).maybeSingle();
  if (projectError) throw projectError; // CR-13: a failed read is not "no base URL"
  const noBaseUrl = "Set the project's base URL before running a suite: every case starts there";
  if (!project?.base_url && !scheduled) throw new AppError('BAD_REQUEST', 400, noBaseUrl);
  // CR-13: a schedule has nobody to answer, so it records the suite run with every case ended for that reason,
  // which shows on its page and in the Slack notice, instead of skipping the slot silently.
  const blocked = project?.base_url ? null : noBaseUrl;

  // G4: a parent's run includes its sub-suites (one level deep: the API refuses deeper nesting), so a green run
  // never hides cases that did not run. Order: the parent's own cases, then each sub-suite's, as the Suites tab lists them.
  const { data: subSuites, error: subError } = await supabase
    .from('test_suites')
    .select('id')
    .eq('parent_suite_id', suite.id)
    .eq('project_id', projectId)
    .order('created_at', { ascending: true });
  if (subError) throw subError;
  const suiteIds = [suite.id, ...(subSuites ?? []).map((s) => s.id)];

  const { data: found, error: casesError } = await supabase
    .from('test_cases')
    .select('id, suite_id')
    .in('suite_id', suiteIds)
    .order('created_at', { ascending: true })
    .limit(MAX_CASES + 1);
  if (casesError) throw casesError;
  if (!found?.length) throw new AppError('BAD_REQUEST', 400, 'This suite has no test cases to run');
  if (found.length > MAX_CASES) {
    const scope = suiteIds.length > 1 ? 'this suite and its sub-suites have' : 'this suite has';
    throw new AppError('BAD_REQUEST', 400, `A suite run is limited to ${MAX_CASES} test cases; ${scope} more`);
  }
  // A stable sort keeps each suite's cases in created order.
  const cases = [...found].sort((a, b) => suiteIds.indexOf(a.suite_id) - suiteIds.indexOf(b.suite_id));

  const { data: batch, error: batchError } = await supabase
    .from('run_batches')
    .insert({ project_id: projectId, suite_id: suite.id, user_id: userId })
    .select('id')
    .single();
  if (batchError || !batch) throw dbError(batchError, 'Could not start the suite run');

  // One row per case, 1 ms apart so "oldest first" is the suite's order.
  const base = Date.now();
  const { data: runs, error: runsError } = await supabase
    .from('test_runs')
    .insert(
      cases.map((c, i) => ({
        project_id: projectId,
        user_id: userId,
        test_case_id: c.id,
        batch_id: batch.id,
        mode: 'ai_driven',
        status: blocked ? 'error' : 'pending',
        ...(blocked && { error_message: blocked, completed_at: new Date().toISOString() }),
        browser: 'chromium',
        created_at: new Date(base + i).toISOString(),
      })),
    )
    .select('id, created_at');
  if (runsError || !runs?.length) {
    await supabase.from('run_batches').delete().eq('id', batch.id); // nothing to show for an empty batch
    throw dbError(runsError, 'Could not start the suite run');
  }

  const runIds = [...runs].sort((a, b) => a.created_at.localeCompare(b.created_at)).map((r) => r.id);
  if (blocked) {
    void notifySuiteRun(batch.id, projectId); // already over: nothing to execute (never throws)
    return { batchId: batch.id, runIds };
  }
  executeBatch(io, userId, projectId, runIds)
    // F10: once every case has finished, tell the project's Slack channel if any did not pass (never throws)
    .then(() => notifySuiteRun(batch.id, projectId))
    .catch((err) => {
      logger.error('Failed to execute suite run', err);
    });
  return { batchId: batch.id, runIds };
}

export interface BatchCounts {
  total: number;
  pending: number;
  running: number;
  passed: number;
  failed: number;
  error: number;
}

/** The suite run with its runs in suite order and the totals, or null when it is not in this project. */
export async function readSuiteRun(batchId: string, projectId: string, userId?: string) {
  let query = supabase
    .from('run_batches')
    .select('id, project_id, suite_id, created_at, test_suites(name)')
    .eq('id', batchId)
    .eq('project_id', projectId);
  if (userId) query = query.eq('user_id', userId);
  const { data: batch, error: batchError } = await query.maybeSingle();
  if (isNotMigrated(batchError)) throw notMigrated();
  if (!batch) return null;

  const { data: runs, error } = await supabase
    .from('test_runs')
    .select('id, status, test_case_id, duration_ms, error_message, created_at, test_cases(title)')
    .eq('batch_id', batch.id)
    .order('created_at', { ascending: true });
  if (error) throw error;

  const counts: BatchCounts = { total: 0, pending: 0, running: 0, passed: 0, failed: 0, error: 0 };
  for (const r of runs ?? []) {
    counts.total++;
    if (r.status in counts) counts[r.status as keyof BatchCounts]++;
  }
  return { batch, runs: runs ?? [], counts };
}
