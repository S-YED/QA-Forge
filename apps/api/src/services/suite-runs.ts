import type { Server } from 'socket.io';
import { AppError } from '../middleware/error-handler.js';
import { supabase } from '../config/supabase.js';
import logger from '../utils/logger.js';
import { executeBatch } from './run-executor.js';

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
 * Queue one run per case of the suite and start executing them in order. The caller has already
 * established that `userId` may act on `projectId`; the suite must belong to that project.
 */
export async function startSuiteRun(
  io: Server | undefined,
  userId: string,
  projectId: string,
  suiteId: string,
): Promise<{ batchId: string; runIds: string[] }> {
  const { data: suite } = await supabase
    .from('test_suites')
    .select('id')
    .eq('id', suiteId)
    .eq('project_id', projectId)
    .maybeSingle();
  if (!suite) throw new AppError('NOT_FOUND', 404, 'Suite not found');

  const { data: cases, error: casesError } = await supabase
    .from('test_cases')
    .select('id')
    .eq('suite_id', suite.id)
    .order('created_at', { ascending: true })
    .limit(MAX_CASES + 1);
  if (casesError) throw casesError;
  if (!cases?.length) throw new AppError('BAD_REQUEST', 400, 'This suite has no test cases to run');
  if (cases.length > MAX_CASES) {
    throw new AppError('BAD_REQUEST', 400, `A suite run is limited to ${MAX_CASES} test cases; this suite has more`);
  }

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
        status: 'pending',
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
  executeBatch(io, userId, projectId, runIds).catch((err) => {
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
