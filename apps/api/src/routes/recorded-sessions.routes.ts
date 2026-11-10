import { Router, type IRouter } from 'express';
import { z } from 'zod';
import { httpUrl, validate } from '../middleware/validation.js';
import { AppError } from '../middleware/error-handler.js';
import { supabase } from '../config/supabase.js';
import { TestCaseStepsSchema, describeStep } from '@qaforge/shared-types';
import { closeRecordingSession } from '../websocket/handlers/recording.handler.js';
import { executeTestOrchestration } from '../services/run-executor.js';

// Router handles requests nested under /projects/:projectId/recorded-sessions
const router: IRouter = Router({ mergeParams: true });

const uuidParamsSchema = z.object({ id: z.string().uuid() });

// ── GET / ──
// Lists all recorded sessions for the project
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

    const { data: sessions, error } = await supabase
      .from('recorded_sessions')
      .select('*')
      .eq('project_id', projectId)
      .order('created_at', { ascending: false });

    if (error) return next(error);

    res.status(200).json({ recorded_sessions: sessions ?? [] });
  } catch (err) {
    next(err);
  }
});

// ── GET /:id ──
// Gets details of a single recorded session and its list of captured actions
router.get('/:id', validate(uuidParamsSchema, 'params'), async (req, res, next) => {
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

    // Get session metadata
    const { data: session, error: sError } = await supabase
      .from('recorded_sessions')
      .select('*')
      .eq('id', req.params.id)
      .eq('project_id', projectId)
      .single();

    if (sError || !session) {
      return next(new AppError('NOT_FOUND', 404, 'Recording session not found'));
    }

    // Get session actions
    const { data: actions, error: aError } = await supabase
      .from('session_actions')
      .select('*')
      .eq('session_id', req.params.id)
      .order('action_number', { ascending: true });

    if (aError) return next(aError);

    res.status(200).json({
      recorded_session: session,
      actions: actions ?? [],
    });
  } catch (err) {
    next(err);
  }
});

// ── POST / ──
// Creates a new recorded session metadata record
const createSessionSchema = z.object({
  name: z.string().min(1).max(200),
  description: z.string().max(1000).optional(),
  base_url: httpUrl(),
  browser: z.enum(['chromium', 'firefox', 'webkit']).optional().default('chromium'),
});

router.post('/', validate(createSessionSchema), async (req, res, next) => {
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

    const { name, description, base_url, browser } = req.body;
    const now = new Date().toISOString();

    const { data: session, error } = await supabase
      .from('recorded_sessions')
      .insert({
        project_id: projectId,
        user_id: req.user.id,
        name,
        description: description ?? null,
        base_url,
        browser,
        status: 'recording',
        created_at: now,
      })
      .select()
      .single();

    if (error || !session) {
      return next(error ?? new AppError('INTERNAL_ERROR', 500, 'Failed to create recording session'));
    }

    res.status(201).json({ recorded_session: session });
  } catch (err) {
    next(err);
  }
});

// ── POST /:id/complete ──
// Marks a recording as completed and closes browser cleanly
router.post('/:id/complete', validate(uuidParamsSchema, 'params'), async (req, res, next) => {
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

    // Call closing function
    await closeRecordingSession(req.params.id as string);

    res.status(200).json({ success: true });
  } catch (err) {
    next(err);
  }
});

// ── POST /:id/replay ──
// Compiles session actions into test case steps and runs it immediately!
router.post('/:id/replay', validate(uuidParamsSchema, 'params'), async (req, res, next) => {
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

    // Fetch session details
    const { data: session } = await supabase
      .from('recorded_sessions')
      .select('*')
      .eq('id', req.params.id)
      .eq('project_id', projectId)
      .single();

    if (!session) {
      return next(new AppError('NOT_FOUND', 404, 'Session not found'));
    }

    // Fetch captured actions
    const { data: actions, error: aError } = await supabase
      .from('session_actions')
      .select('*')
      .eq('session_id', req.params.id)
      .order('action_number', { ascending: true });

    if (aError || !actions || actions.length === 0) {
      return next(new AppError('BAD_REQUEST', 400, 'Recording has no actions to replay'));
    }

    // 1. Compile recorded actions to canonical steps (the recorder emits click/type/select only)
    const RECORDED_TO_STEP = { click: 'click', type: 'fill', select: 'select' } as const;
    // Step 1 opens the page the recording started on: a run otherwise starts at the project's base URL,
    // which may be a different page (e.g. a recording made on /login of a project based on /).
    const openStart = { step_number: 1, action: 'navigate' as const, instruction: describeStep({ action: 'navigate', value: session.base_url }), value: session.base_url };
    const parsedSteps = TestCaseStepsSchema.safeParse([
      openStart,
      ...actions.map((act, idx) => {
        const action = RECORDED_TO_STEP[act.action_type as keyof typeof RECORDED_TO_STEP];
        const selector = act.selector || undefined;
        const value = act.value || undefined;
        return {
          step_number: idx + 2,
          action,
          // Reads like a written step: Click "Sign in", Type "ada@example.com" into "Email"
          instruction: action ? describeStep({ action, selector, value }) : String(act.action_type),
          selector,
          value,
        };
      }),
    ]);
    if (!parsedSteps.success) {
      return next(new AppError('BAD_REQUEST', 400, 'Recording contains actions that cannot be replayed', parsedSteps.error.format()));
    }
    const steps = parsedSteps.data;

    // 2. Resolve or create a specific 'Replayed Session Tests' suite for replayed runs
    let suiteId: string;
    const { data: existingSuite } = await supabase
      .from('test_suites')
      .select('id')
      .eq('project_id', projectId)
      .eq('name', 'Replayed Session Tests')
      .limit(1);

    if (existingSuite && existingSuite.length > 0) {
      suiteId = existingSuite[0].id;
    } else {
      const now = new Date().toISOString();
      const { data: newSuite } = await supabase
        .from('test_suites')
        .insert({
          project_id: projectId,
          name: 'Replayed Session Tests',
          description: 'Automated test suite compiled from manual browser recordings.',
          created_at: now,
          updated_at: now,
        })
        .select()
        .single();
      
      if (!newSuite) {
        return next(new AppError('INTERNAL_ERROR', 500, 'Failed to create suite'));
      }
      suiteId = newSuite.id;
    }

    // 3. Create a new test case out of these compiled steps
    const caseTitle = `Replay of recording: ${session.name}`;
    const now = new Date().toISOString();

    const { data: testCase, error: caseError } = await supabase
      .from('test_cases')
      .insert({
        suite_id: suiteId,
        title: caseTitle,
        description: `Automated compile of recorded session ${session.id}`,
        steps,
        is_ai_generated: false,
        source: 'manual',
        created_at: now,
        updated_at: now,
      })
      .select()
      .single();

    if (caseError || !testCase) {
      return next(caseError ?? new AppError('INTERNAL_ERROR', 500, 'Failed to create test case'));
    }

    // 4. Create and trigger a test run execution
    const { data: run, error: runError } = await supabase
      .from('test_runs')
      .insert({
        project_id: projectId,
        user_id: req.user.id,
        test_case_id: testCase.id,
        status: 'pending',
        mode: 'replay',
        browser: session.browser || 'chromium',
        created_at: now,
      })
      .select()
      .single();

    if (runError || !run) {
      return next(runError ?? new AppError('INTERNAL_ERROR', 500, 'Failed to create test run'));
    }

    // 5. Trigger async orchestrator execution
    const io = req.app.get('io');
    executeTestOrchestration(io, req.user.id, {
      test_run_id: run.id,
      project_id: projectId,
    }).catch((err) => {
      console.error('Failed to execute replayed test run', err);
    });

    res.status(201).json({
      test_case: testCase,
      test_run: run,
    });
  } catch (err) {
    next(err);
  }
});

export default router;
