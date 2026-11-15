import { Router, type IRouter } from 'express';
import { z } from 'zod';
import { validate } from '../middleware/validation.js';
import { AppError } from '../middleware/error-handler.js';
import { supabase } from '../config/supabase.js';
import { STOPPED, executeBatch, stopRun } from '../services/run-executor.js';
import { demoRunLimiter } from '../middleware/rate-limiter.js';
import logger from '../utils/logger.js';

// F3: run a whole suite. Routes nested under /projects/:projectId/run-batches,
// pre-protected by `authenticate` and `demoGuard` in app.ts.

const router: IRouter = Router({ mergeParams: true });

const uuidParamsSchema = z.object({ id: z.guid() });
const createBatchSchema = z.object({ suite_id: z.guid() });

/** A suite run is capped so one click cannot queue hours of browser time. */
const MAX_CASES = 50;

/** Postgres/PostgREST codes for "table or column missing": migration 26 has not been applied yet. */
const NOT_MIGRATED = ['42P01', '42703', 'PGRST204', 'PGRST205'];
const notMigrated = () =>
  new AppError('NOT_AVAILABLE', 503, 'Suite runs are not available yet: the database is missing migration 26.');
const dbError = (error: { code?: string } | null, fallback: string) =>
  error && NOT_MIGRATED.includes(error.code ?? '') ? notMigrated() : (error ?? new AppError('INTERNAL_ERROR', 500, fallback));

/** The batch if it exists in this project and belongs to the caller. */
async function ownBatch(batchId: string, projectId: string, userId: string) {
  const { data, error } = await supabase
    .from('run_batches')
    .select('id, project_id, suite_id, created_at, test_suites(name)')
    .eq('id', batchId)
    .eq('project_id', projectId)
    .eq('user_id', userId)
    .maybeSingle();
  if (error && NOT_MIGRATED.includes(error.code)) throw notMigrated();
  return data;
}

// ── POST /projects/:projectId/run-batches ─────────────────────────────────────

router.post('/', demoRunLimiter, validate(createBatchSchema), async (req, res, next) => {
  try {
    const projectId = req.params.projectId as string;

    const { data: project } = await supabase
      .from('projects')
      .select('id')
      .eq('id', projectId)
      .eq('user_id', req.user.id)
      .maybeSingle();
    if (!project) return next(new AppError('NOT_FOUND', 404, 'Project not found'));

    const { data: suite } = await supabase
      .from('test_suites')
      .select('id')
      .eq('id', req.body.suite_id)
      .eq('project_id', projectId)
      .maybeSingle();
    if (!suite) return next(new AppError('NOT_FOUND', 404, 'Suite not found'));

    const { data: cases, error: casesError } = await supabase
      .from('test_cases')
      .select('id')
      .eq('suite_id', suite.id)
      .order('created_at', { ascending: true })
      .limit(MAX_CASES + 1);
    if (casesError) return next(casesError);
    if (!cases?.length) return next(new AppError('BAD_REQUEST', 400, 'This suite has no test cases to run'));
    if (cases.length > MAX_CASES) {
      return next(new AppError('BAD_REQUEST', 400, `A suite run is limited to ${MAX_CASES} test cases; this suite has more`));
    }

    const { data: batch, error: batchError } = await supabase
      .from('run_batches')
      .insert({ project_id: projectId, suite_id: suite.id, user_id: req.user.id })
      .select('id')
      .single();
    if (batchError || !batch) return next(dbError(batchError, 'Could not start the suite run'));

    // One row per case, 1 ms apart so "oldest first" is the suite's order.
    const base = Date.now();
    const { data: runs, error: runsError } = await supabase
      .from('test_runs')
      .insert(
        cases.map((c, i) => ({
          project_id: projectId,
          user_id: req.user.id,
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
      return next(dbError(runsError, 'Could not start the suite run'));
    }

    const runIds = [...runs].sort((a, b) => a.created_at.localeCompare(b.created_at)).map((r) => r.id);
    executeBatch(req.app.get('io'), req.user.id, projectId, runIds).catch((err) => {
      logger.error('Failed to execute suite run', err);
    });

    res.status(201).json({ batch: { id: batch.id }, run_ids: runIds });
  } catch (err) {
    next(err);
  }
});

// ── GET /projects/:projectId/run-batches/:id ──────────────────────────────────

router.get('/:id', validate(uuidParamsSchema, 'params'), async (req, res, next) => {
  try {
    const batch = await ownBatch(req.params.id as string, req.params.projectId as string, req.user.id);
    if (!batch) return next(new AppError('NOT_FOUND', 404, 'Suite run not found'));

    const { data: runs, error } = await supabase
      .from('test_runs')
      .select('id, status, test_case_id, duration_ms, error_message, created_at, test_cases(title)')
      .eq('batch_id', batch.id)
      .order('created_at', { ascending: true });
    if (error) return next(error);

    const counts = { total: 0, pending: 0, running: 0, passed: 0, failed: 0, error: 0 };
    for (const r of runs ?? []) {
      counts.total++;
      if (r.status in counts) counts[r.status as keyof typeof counts]++;
    }
    res.status(200).json({ batch, runs: runs ?? [], counts });
  } catch (err) {
    next(err);
  }
});

// ── POST /projects/:projectId/run-batches/:id/cancel ──────────────────────────
// Stop all: cases not started yet are closed first (so none can start), then the running one is stopped.

router.post('/:id/cancel', validate(uuidParamsSchema, 'params'), async (req, res, next) => {
  try {
    const batch = await ownBatch(req.params.id as string, req.params.projectId as string, req.user.id);
    if (!batch) return next(new AppError('NOT_FOUND', 404, 'Suite run not found'));

    const closed = { status: 'error', error_message: STOPPED, completed_at: new Date().toISOString() };
    const { data: skipped, error: pendingError } = await supabase
      .from('test_runs')
      .update(closed)
      .eq('batch_id', batch.id)
      .eq('status', 'pending')
      .select('id');
    if (pendingError) return next(pendingError);

    const { data: running, error: runningError } = await supabase
      .from('test_runs')
      .select('id')
      .eq('batch_id', batch.id)
      .eq('status', 'running');
    if (runningError) return next(runningError);
    for (const run of running ?? []) {
      if (!stopRun(run.id)) {
        // Not executing in this process (left behind): close it here, only if still open.
        await supabase.from('test_runs').update(closed).eq('id', run.id).eq('status', 'running');
      }
    }

    res.status(202).json({ stopped: (skipped?.length ?? 0) + (running?.length ?? 0) });
  } catch (err) {
    next(err);
  }
});

export default router;
