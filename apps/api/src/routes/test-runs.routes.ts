import { Router, type IRouter } from 'express';
import { z } from 'zod';
import { validate } from '../middleware/validation.js';
import { AppError } from '../middleware/error-handler.js';
import { supabase } from '../config/supabase.js';
import { STOPPED, executeTestOrchestration, stopRun } from '../services/run-executor.js';
import { signArtifacts } from '../utils/artifacts.js';
import { demoRunLimiter } from '../middleware/rate-limiter.js';
import logger from '../utils/logger.js';
// All routes nested under /projects/:projectId/test-runs
// Pre-protected by `authenticate` applied in app.ts.

const router: IRouter = Router({ mergeParams: true });

const uuidParamsSchema = z.object({ id: z.guid() });

// ── GET /projects/:projectId/test-runs ────────────────────────────────────────

router.get('/', async (req, res, next) => {
  try {
    const { projectId } = req.params as any;

    // Verify project ownership
    const { data: project } = await supabase
      .from('projects')
      .select('id')
      .eq('id', projectId)
      .eq('user_id', req.user.id)
      .single();

    if (!project) {
      return next(new AppError('NOT_FOUND', 404, 'Project not found'));
    }

    // Pagination
    const page = Math.max(1, parseInt(req.query.page as string) || 1);
    const perPage = Math.min(50, Math.max(1, parseInt(req.query.per_page as string) || 20));
    const from = (page - 1) * perPage;
    const to = from + perPage - 1;

    const { data: runs, error, count } = await supabase
      .from('test_runs')
      .select('*, test_cases(title)', { count: 'exact' })
      .eq('project_id', projectId)
      .eq('user_id', req.user.id)
      .order('created_at', { ascending: false })
      .range(from, to);

    if (error) return next(error);

    res.status(200).json({
      test_runs: runs ?? [],
      count: count ?? 0,
      page,
      per_page: perPage,
    });
  } catch (err) {
    next(err);
  }
});

// ── GET /projects/:projectId/test-runs/:id ────────────────────────────────────

router.get(
  '/:id',
  validate(uuidParamsSchema, 'params'),
  async (req, res, next) => {
    try {
      const { data: run, error } = await supabase
        .from('test_runs')
        .select('*, test_cases(title, steps), projects(base_url)')
        .eq('id', req.params.id)
        .eq('project_id', req.params.projectId)
        .eq('user_id', req.user.id)
        .single();

      if (error || !run) {
        return next(new AppError('NOT_FOUND', 404, 'Test run not found'));
      }

      // Fetch steps for this run
      const { data: steps } = await supabase
        .from('test_steps')
        .select('*')
        .eq('test_run_id', req.params.id)
        .order('step_number', { ascending: true });

      // Fetch linked bugs
      const { data: bugs } = await supabase
        .from('bugs')
        .select('id, title, severity, status')
        .eq('test_run_id', req.params.id);

      // Screenshots are private (EXE-3): stored paths become short-lived signed URLs here.
      const signed = await signArtifacts((steps ?? []).map((s) => s.screenshot_url));
      res.status(200).json({
        test_run: run,
        steps: (steps ?? []).map((s, i) => ({ ...s, screenshot_url: signed[i] })),
        bugs: bugs ?? [],
      });
    } catch (err) {
      next(err);
    }
  },
);

// ── POST /projects/:projectId/test-runs ───────────────────────────────────────

const createRunSchema = z.object({
  // A run always executes a saved (reviewed) test case; run-time AI generation was removed (EXE-1).
  test_case_id: z.guid(),
  mode: z.enum(['ai_driven', 'manual_recording', 'replay']),
  browser: z.enum(['chromium', 'firefox', 'webkit']).optional().default('chromium'),
});

// `demoRunLimiter` caps demo-user runs at 5/hour (defense-in-depth behind
// demoGuard, which currently blocks demo writes outright). The per-user
// concurrent-run cap is enforced inside executeTestOrchestration via
// acquireSlot/releaseSlot, so it applies to every user, not just demo.
router.post('/', demoRunLimiter, validate(createRunSchema), async (req, res, next) => {
  try {
    const projectId = req.params.projectId;

    // Verify project ownership
    const { data: project } = await supabase
      .from('projects')
      .select('id, base_url')
      .eq('id', projectId)
      .eq('user_id', req.user.id)
      .single();

    if (!project) {
      return next(new AppError('NOT_FOUND', 404, 'Project not found'));
    }

    // Verify the test case exists and belongs to this project
    const { data: testCase } = await supabase
      .from('test_cases')
      .select('id, suite_id')
      .eq('id', req.body.test_case_id)
      .single();

    if (!testCase) {
      return next(new AppError('NOT_FOUND', 404, 'Test case not found'));
    }

    // Verify suite belongs to the project
    const { data: suite } = await supabase
      .from('test_suites')
      .select('id')
      .eq('id', testCase.suite_id)
      .eq('project_id', projectId)
      .single();

    if (!suite) {
      return next(new AppError('NOT_FOUND', 404, 'Test case does not belong to this project'));
    }

    const now = new Date().toISOString();

    const { data: run, error } = await supabase
      .from('test_runs')
      .insert({
        project_id: projectId,
        user_id: req.user.id,
        test_case_id: req.body.test_case_id,
        mode: req.body.mode,
        status: 'pending',
        browser: req.body.browser ?? 'chromium',
        created_at: now,
      })
      .select()
      .single();

    if (error || !run) {
      return next(error ?? new AppError('INTERNAL_ERROR', 500, 'Failed to create test run'));
    }

    // Trigger execution orchestration immediately
    const io = req.app.get('io');
    executeTestOrchestration(io, req.user.id, {
      test_run_id: run.id,
      project_id: projectId as string,
    }).catch(err => {
      logger.error('Failed to execute test run', err);
    });

    res.status(201).json({ test_run: run });
  } catch (err) {
    next(err);
  }
});

// ── POST /projects/:projectId/test-runs/:id/cancel ───────────────────────────
// F1: the owner stops a pending or running test. The executor closes the browser and records why.

router.post('/:id/cancel', validate(uuidParamsSchema, 'params'), async (req, res, next) => {
  try {
    const { data: run } = await supabase
      .from('test_runs')
      .select('id, status')
      .eq('id', req.params.id)
      .eq('project_id', req.params.projectId)
      .eq('user_id', req.user.id)
      .maybeSingle();
    if (!run) return next(new AppError('NOT_FOUND', 404, 'Test run not found'));
    if (!['pending', 'running'].includes(run.status)) {
      return next(new AppError('CONFLICT', 409, 'This run has already finished'));
    }

    if (!stopRun(run.id)) {
      // Not executing in this process (never started, or left behind): close it here, only if still open.
      const { error } = await supabase
        .from('test_runs')
        .update({ status: 'error', error_message: STOPPED, completed_at: new Date().toISOString() })
        .eq('id', run.id)
        .in('status', ['pending', 'running']);
      if (error) return next(error);
    }
    res.status(202).json({ stopping: true });
  } catch (err) {
    next(err);
  }
});

export default router;
