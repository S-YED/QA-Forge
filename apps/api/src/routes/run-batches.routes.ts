import { Router, type IRouter } from 'express';
import { z } from 'zod';
import { validate } from '../middleware/validation.js';
import { AppError } from '../middleware/error-handler.js';
import { supabase } from '../config/supabase.js';
import { STOPPED, stopRun } from '../services/run-executor.js';
import { readSuiteRun, startSuiteRun } from '../services/suite-runs.js';
import { demoRunLimiter } from '../middleware/rate-limiter.js';

// F3: run a whole suite (signed-in users). Routes nested under /projects/:projectId/run-batches,
// pre-protected by `authenticate` and `demoGuard` in app.ts. The same service backs the CI routes (F8).

const router: IRouter = Router({ mergeParams: true });

const uuidParamsSchema = z.object({ id: z.guid() });
const createBatchSchema = z.object({ suite_id: z.guid() });

const params = (req: { params: unknown }) => req.params as { projectId: string; id: string };

// ── POST /projects/:projectId/run-batches ─────────────────────────────────────

router.post('/', demoRunLimiter, validate(createBatchSchema), async (req, res, next) => {
  try {
    const { projectId } = params(req);
    const { data: project } = await supabase
      .from('projects')
      .select('id')
      .eq('id', projectId)
      .eq('user_id', req.user.id)
      .maybeSingle();
    if (!project) return next(new AppError('NOT_FOUND', 404, 'Project not found'));

    const { batchId, runIds } = await startSuiteRun(req.app.get('io'), req.user.id, projectId, req.body.suite_id);
    res.status(201).json({ batch: { id: batchId }, run_ids: runIds });
  } catch (err) {
    next(err);
  }
});

// ── GET /projects/:projectId/run-batches/:id ──────────────────────────────────

router.get('/:id', validate(uuidParamsSchema, 'params'), async (req, res, next) => {
  try {
    const { projectId, id } = params(req);
    const found = await readSuiteRun(id, projectId, req.user.id);
    if (!found) return next(new AppError('NOT_FOUND', 404, 'Suite run not found'));
    res.status(200).json(found);
  } catch (err) {
    next(err);
  }
});

// ── POST /projects/:projectId/run-batches/:id/cancel ──────────────────────────
// Stop all: cases not started yet are closed first (so none can start), then the running one is stopped.

router.post('/:id/cancel', validate(uuidParamsSchema, 'params'), async (req, res, next) => {
  try {
    const { projectId, id } = params(req);
    const found = await readSuiteRun(id, projectId, req.user.id);
    if (!found) return next(new AppError('NOT_FOUND', 404, 'Suite run not found'));

    const closed = { status: 'error', error_message: STOPPED, completed_at: new Date().toISOString() };
    const { data: skipped, error: pendingError } = await supabase
      .from('test_runs')
      .update(closed)
      .eq('batch_id', id)
      .eq('status', 'pending')
      .select('id');
    if (pendingError) return next(pendingError);

    const { data: running, error: runningError } = await supabase
      .from('test_runs')
      .select('id')
      .eq('batch_id', id)
      .eq('status', 'running');
    if (runningError) return next(runningError);
    for (const run of running ?? []) {
      if (!stopRun(run.id)) {
        // Not executing in this process (left behind): close it here, only if still open.
        await supabase.from('test_runs').update(closed).eq('id', run.id).eq('status', 'running');
        stopRun(run.id); // G9: unless the executor listed it in flight meanwhile; then stop it there too
      }
    }

    res.status(202).json({ stopped: (skipped?.length ?? 0) + (running?.length ?? 0) });
  } catch (err) {
    next(err);
  }
});

export default router;
