import { Router, type IRouter } from 'express';
import { z } from 'zod';
import { validate } from '../middleware/validation.js';
import { AppError } from '../middleware/error-handler.js';
import { supabase } from '../config/supabase.js';
import { TestCaseStepsSchema } from '@qaforge/shared-types';

// All routes nested under /projects/:projectId/test-suites/:suiteId/test-cases
// Pre-protected by `authenticate` applied in app.ts.

const router: IRouter = Router({ mergeParams: true });

const uuidParamsSchema = z.object({ id: z.guid() });


// ── Ownership helper ─────────────────────────────────────────────────────────

async function verifyOwnership(projectId: string, suiteId: string, userId: string): Promise<boolean> {
  const { data: project } = await supabase
    .from('projects')
    .select('id')
    .eq('id', projectId)
    .eq('user_id', userId)
    .single();

  if (!project) return false;

  const { data: suite } = await supabase
    .from('test_suites')
    .select('id')
    .eq('id', suiteId)
    .eq('project_id', projectId)
    .single();

  return !!suite;
}

// ── GET /projects/:projectId/test-suites/:suiteId/test-cases ─────────────────

router.get('/', async (req, res, next) => {
  try {
    const { projectId, suiteId } = req.params as any;

    if (!(await verifyOwnership(projectId, suiteId, req.user.id))) {
      return next(new AppError('NOT_FOUND', 404, 'Suite not found'));
    }

    const { data: cases, error } = await supabase
      .from('test_cases')
      .select('*')
      .eq('suite_id', suiteId)
      .order('created_at', { ascending: true });

    if (error) return next(error);

    res.status(200).json({ test_cases: cases ?? [] });
  } catch (err) {
    next(err);
  }
});

// ── GET /projects/:projectId/test-suites/:suiteId/test-cases/:id ─────────────

router.get(
  '/:id',
  validate(uuidParamsSchema, 'params'),
  async (req, res, next) => {
    try {
      const { projectId, suiteId } = req.params as any;

      if (!(await verifyOwnership(projectId, suiteId, req.user.id))) {
        return next(new AppError('NOT_FOUND', 404, 'Suite not found'));
      }

      const { data: testCase, error } = await supabase
        .from('test_cases')
        .select('*')
        .eq('id', req.params.id)
        .eq('suite_id', suiteId)
        .single();

      if (error || !testCase) {
        return next(new AppError('NOT_FOUND', 404, 'Test case not found'));
      }

      res.status(200).json({ test_case: testCase });
    } catch (err) {
      next(err);
    }
  },
);

// ── POST /projects/:projectId/test-suites/:suiteId/test-cases ────────────────

const createTestCaseSchema = z.object({
  title: z.string().min(1).max(500),
  description: z.string().max(2000).optional(),
  steps: TestCaseStepsSchema,
  expected_result: z.string().max(1000).optional(),
  priority: z.enum(['critical', 'high', 'medium', 'low']).optional().default('medium'),
  type: z.enum(['functional', 'regression', 'smoke', 'edge_case', 'accessibility', 'negative']).optional().default('functional'),
  // G6: the same cap as AI drafts (GeneratedTestCaseSchema): 20 tags of up to 50 characters
  tags: z.array(z.string().max(50)).max(20).optional().default([]),
});

router.post('/', validate(createTestCaseSchema), async (req, res, next) => {
  try {
    const { projectId, suiteId } = req.params as any;

    if (!(await verifyOwnership(projectId, suiteId, req.user.id))) {
      return next(new AppError('NOT_FOUND', 404, 'Suite not found'));
    }

    const now = new Date().toISOString();

    const { data: testCase, error } = await supabase
      .from('test_cases')
      .insert({
        suite_id: suiteId,
        title: req.body.title,
        description: req.body.description ?? null,
        steps: req.body.steps,
        expected_result: req.body.expected_result ?? null,
        priority: req.body.priority,
        type: req.body.type,
        tags: req.body.tags,
        is_ai_generated: false,
        source: 'manual',
        created_at: now,
        updated_at: now,
      })
      .select()
      .single();

    if (error || !testCase) {
      return next(error ?? new AppError('INTERNAL_ERROR', 500, 'Failed to create test case'));
    }

    res.status(201).json({ test_case: testCase });
  } catch (err) {
    next(err);
  }
});

// ── PUT /projects/:projectId/test-suites/:suiteId/test-cases/:id ─────────────

const updateTestCaseSchema = z.object({
  title: z.string().min(1).max(500).optional(),
  description: z.string().max(2000).optional().nullable(),
  steps: TestCaseStepsSchema.optional(),
  expected_result: z.string().max(1000).optional().nullable(),
  priority: z.enum(['critical', 'high', 'medium', 'low']).optional(),
  type: z.enum(['functional', 'regression', 'smoke', 'edge_case', 'accessibility', 'negative']).optional(),
  tags: z.array(z.string().max(50)).max(20).optional(),
  /** F6: move the case to another suite of the same project */
  suite_id: z.guid().optional(),
});

router.put(
  '/:id',
  validate(uuidParamsSchema, 'params'),
  validate(updateTestCaseSchema),
  async (req, res, next) => {
    try {
      const { projectId, suiteId } = req.params as any;

      if (!(await verifyOwnership(projectId, suiteId, req.user.id))) {
        return next(new AppError('NOT_FOUND', 404, 'Suite not found'));
      }
      // A move: the target must be a suite of this same project (which the caller owns).
      if (req.body.suite_id && req.body.suite_id !== suiteId && !(await verifyOwnership(projectId, req.body.suite_id, req.user.id))) {
        return next(new AppError('NOT_FOUND', 404, 'Target suite not found'));
      }

      const { data: testCase, error } = await supabase
        .from('test_cases')
        .update({
          ...req.body,
          updated_at: new Date().toISOString(),
        })
        .eq('id', req.params.id)
        .eq('suite_id', suiteId)
        .select()
        .single();

      if (error || !testCase) {
        return next(new AppError('NOT_FOUND', 404, 'Test case not found'));
      }

      res.status(200).json({ test_case: testCase });
    } catch (err) {
      next(err);
    }
  },
);

// ── POST /projects/:projectId/test-suites/:suiteId/test-cases/:id/duplicate ──
// F6: a copy of the case in the same suite, titled "<title> (copy)".

router.post('/:id/duplicate', validate(uuidParamsSchema, 'params'), async (req, res, next) => {
  try {
    const { projectId, suiteId } = req.params as unknown as { projectId: string; suiteId: string };

    if (!(await verifyOwnership(projectId, suiteId, req.user.id))) {
      return next(new AppError('NOT_FOUND', 404, 'Suite not found'));
    }

    const { data: original } = await supabase.from('test_cases').select('*').eq('id', req.params.id).eq('suite_id', suiteId).single();
    if (!original) return next(new AppError('NOT_FOUND', 404, 'Test case not found'));

    const now = new Date().toISOString();
    // id is left for the database to assign
    const { data: testCase, error } = await supabase
      .from('test_cases')
      // CR-12: a copy is never the recording's own case (left out, so it is null; also before migration 32)
      .insert({ ...original, id: undefined, recorded_session_id: undefined, title: `${String(original.title).slice(0, 493)} (copy)`, created_at: now, updated_at: now })
      .select()
      .single();
    if (error || !testCase) return next(error ?? new AppError('INTERNAL_ERROR', 500, 'Failed to duplicate test case'));

    res.status(201).json({ test_case: testCase });
  } catch (err) {
    next(err);
  }
});

// ── DELETE /projects/:projectId/test-suites/:suiteId/test-cases/:id ──────────

router.delete(
  '/:id',
  validate(uuidParamsSchema, 'params'),
  async (req, res, next) => {
    try {
      const { projectId, suiteId } = req.params as any;

      if (!(await verifyOwnership(projectId, suiteId, req.user.id))) {
        return next(new AppError('NOT_FOUND', 404, 'Suite not found'));
      }

      const { data, error } = await supabase
        .from('test_cases')
        .delete()
        .eq('id', req.params.id)
        .eq('suite_id', suiteId)
        .select()
        .single();

      if (error || !data) {
        return next(new AppError('NOT_FOUND', 404, 'Test case not found'));
      }

      res.status(200).json({ success: true });
    } catch (err) {
      next(err);
    }
  },
);

export default router;
