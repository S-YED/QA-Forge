import { Router, type IRouter } from 'express';
import { z } from 'zod';
import { validate } from '../middleware/validation.js';
import { AppError } from '../middleware/error-handler.js';
import { supabase } from '../config/supabase.js';

// All routes nested under /projects/:projectId/test-suites/:suiteId/test-cases
// Pre-protected by `authenticate` applied in app.ts.

const router: IRouter = Router({ mergeParams: true });

const uuidParamsSchema = z.object({ id: z.string().uuid() });

const stepSchema = z.object({
  step_number: z.number().int().min(1),
  instruction: z.string().min(1),
  selector: z.string().optional(),
  value: z.string().optional(),
  expected: z.string().optional(),
});

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
    const { projectId, suiteId } = req.params;

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
      const { projectId, suiteId } = req.params;

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
  steps: z.array(stepSchema).min(1),
  expected_result: z.string().max(1000).optional(),
  priority: z.enum(['critical', 'high', 'medium', 'low']).optional().default('medium'),
  type: z.enum(['functional', 'regression', 'smoke', 'edge_case', 'accessibility', 'negative']).optional().default('functional'),
  tags: z.array(z.string()).optional().default([]),
});

router.post('/', validate(createTestCaseSchema), async (req, res, next) => {
  try {
    const { projectId, suiteId } = req.params;

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
  steps: z.array(stepSchema).min(1).optional(),
  expected_result: z.string().max(1000).optional().nullable(),
  priority: z.enum(['critical', 'high', 'medium', 'low']).optional(),
  type: z.enum(['functional', 'regression', 'smoke', 'edge_case', 'accessibility', 'negative']).optional(),
  tags: z.array(z.string()).optional(),
});

router.put(
  '/:id',
  validate(uuidParamsSchema, 'params'),
  validate(updateTestCaseSchema),
  async (req, res, next) => {
    try {
      const { projectId, suiteId } = req.params;

      if (!(await verifyOwnership(projectId, suiteId, req.user.id))) {
        return next(new AppError('NOT_FOUND', 404, 'Suite not found'));
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

// ── DELETE /projects/:projectId/test-suites/:suiteId/test-cases/:id ──────────

router.delete(
  '/:id',
  validate(uuidParamsSchema, 'params'),
  async (req, res, next) => {
    try {
      const { projectId, suiteId } = req.params;

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
