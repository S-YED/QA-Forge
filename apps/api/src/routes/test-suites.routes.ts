import { Router, type IRouter } from 'express';
import { z } from 'zod';
import { validate } from '../middleware/validation.js';
import { AppError } from '../middleware/error-handler.js';
import { supabase } from '../config/supabase.js';

// All routes in this router are pre-protected by `authenticate` applied in app.ts.

const router: IRouter = Router({ mergeParams: true });

const uuidParamsSchema = z.object({ id: z.string().uuid() });

// ── GET /projects/:projectId/test-suites ───────────────────────────────────────
// Returns all suites for a project in flat array. Client can rebuild tree from parent_suite_id.

router.get('/', async (req, res, next) => {
  try {
    const projectId = req.params.projectId;

    // Verify project ownership
    const { data: project, error: pError } = await supabase
      .from('projects')
      .select('id')
      .eq('id', projectId)
      .eq('user_id', req.user.id)
      .single();

    if (pError || !project) {
      return next(new AppError('NOT_FOUND', 404, 'Project not found'));
    }

    const { data: suites, error } = await supabase
      .from('test_suites')
      .select('*, test_cases(count)')
      .eq('project_id', projectId)
      .order('created_at', { ascending: true });

    if (error) return next(error);

    res.status(200).json({ suites: suites ?? [] });
  } catch (err) {
    next(err);
  }
});

// ── GET /projects/:projectId/test-suites/:id ──────────────────────────────────

router.get(
  '/:id',
  validate(uuidParamsSchema, 'params'),
  async (req, res, next) => {
    try {
      const { data: suite, error } = await supabase
        .from('test_suites')
        .select('*')
        .eq('id', req.params.id)
        .eq('project_id', req.params.projectId)
        .single();

      if (error || !suite) {
        return next(new AppError('NOT_FOUND', 404, 'Test suite not found'));
      }

      // Verify ownership via project
      const { data: project } = await supabase
        .from('projects')
        .select('id')
        .eq('id', req.params.projectId)
        .eq('user_id', req.user.id)
        .single();

      if (!project) {
        return next(new AppError('NOT_FOUND', 404, 'Test suite not found'));
      }

      // Fetch child suites and test cases
      const [childSuites, testCases] = await Promise.all([
        supabase
          .from('test_suites')
          .select('*')
          .eq('parent_suite_id', req.params.id)
          .order('created_at', { ascending: true }),
        supabase
          .from('test_cases')
          .select('*')
          .eq('suite_id', req.params.id)
          .order('created_at', { ascending: true }),
      ]);

      res.status(200).json({
        suite,
        child_suites: childSuites.data ?? [],
        test_cases: testCases.data ?? [],
      });
    } catch (err) {
      next(err);
    }
  },
);

// ── POST /projects/:projectId/test-suites ─────────────────────────────────────

const createSuiteSchema = z.object({
  name: z.string().min(1).max(200),
  description: z.string().max(1000).optional(),
  parent_suite_id: z.string().uuid().optional().nullable(),
});

router.post('/', validate(createSuiteSchema), async (req, res, next) => {
  try {
    const projectId = req.params.projectId;

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

    // If parent_suite_id is provided, verify it belongs to the same project
    if (req.body.parent_suite_id) {
      const { data: parentSuite } = await supabase
        .from('test_suites')
        .select('id, parent_suite_id')
        .eq('id', req.body.parent_suite_id)
        .eq('project_id', projectId)
        .single();

      if (!parentSuite) {
        return next(new AppError('NOT_FOUND', 404, 'Parent suite not found'));
      }

      // Check hierarchy constraints: parent suite cannot have a parent (MVP-2 max 1 level)
      if (parentSuite.parent_suite_id) {
        return next(new AppError('BAD_REQUEST', 400, 'Nested suites deeper than 1 level are not supported in MVP-2'));
      }
    }

    const now = new Date().toISOString();

    const { data: suite, error } = await supabase
      .from('test_suites')
      .insert({
        project_id: projectId,
        parent_suite_id: req.body.parent_suite_id ?? null,
        name: req.body.name,
        description: req.body.description ?? null,
        created_at: now,
        updated_at: now,
      })
      .select()
      .single();

    if (error || !suite) {
      return next(error ?? new AppError('INTERNAL_ERROR', 500, 'Failed to create test suite'));
    }

    res.status(201).json({ suite });
  } catch (err) {
    next(err);
  }
});

// ── PUT /projects/:projectId/test-suites/:id ──────────────────────────────────

const updateSuiteSchema = z.object({
  name: z.string().min(1).max(200).optional(),
  description: z.string().max(1000).optional().nullable(),
  parent_suite_id: z.string().uuid().optional().nullable(),
});

router.put(
  '/:id',
  validate(uuidParamsSchema, 'params'),
  validate(updateSuiteSchema),
  async (req, res, next) => {
    try {
      // Verify project ownership
      const { data: project } = await supabase
        .from('projects')
        .select('id')
        .eq('id', req.params.projectId)
        .eq('user_id', req.user.id)
        .single();

      if (!project) {
        return next(new AppError('NOT_FOUND', 404, 'Project not found'));
      }

      // Enforce hierarchy constraints
      if (req.body.parent_suite_id !== undefined) {
        const parentId = req.body.parent_suite_id;

        if (parentId === req.params.id) {
          return next(new AppError('BAD_REQUEST', 400, 'A suite cannot be its own parent'));
        }

        if (parentId) {
          const { data: parentSuite } = await supabase
            .from('test_suites')
            .select('id, parent_suite_id')
            .eq('id', parentId)
            .eq('project_id', req.params.projectId)
            .single();

          if (!parentSuite) {
            return next(new AppError('NOT_FOUND', 404, 'Parent suite not found'));
          }

          if (parentSuite.parent_suite_id) {
            return next(new AppError('BAD_REQUEST', 400, 'Nested suites deeper than 1 level are not supported in MVP-2'));
          }

          // Also check if current suite is a parent of any other suite, to prevent cycles
          const { data: children } = await supabase
            .from('test_suites')
            .select('id')
            .eq('parent_suite_id', req.params.id)
            .limit(1);

          if (children && children.length > 0) {
            return next(new AppError('BAD_REQUEST', 400, 'Cannot move a parent suite to be a child of another suite.'));
          }
        }
      }

      const { data: suite, error } = await supabase
        .from('test_suites')
        .update({
          ...req.body,
          updated_at: new Date().toISOString(),
        })
        .eq('id', req.params.id)
        .eq('project_id', req.params.projectId)
        .select()
        .single();

      if (error || !suite) {
        return next(new AppError('NOT_FOUND', 404, 'Test suite not found'));
      }

      res.status(200).json({ suite });
    } catch (err) {
      next(err);
    }
  },
);

// ── DELETE /projects/:projectId/test-suites/:id ───────────────────────────────

router.delete(
  '/:id',
  validate(uuidParamsSchema, 'params'),
  async (req, res, next) => {
    try {
      // Verify project ownership
      const { data: project } = await supabase
        .from('projects')
        .select('id')
        .eq('id', req.params.projectId)
        .eq('user_id', req.user.id)
        .single();

      if (!project) {
        return next(new AppError('NOT_FOUND', 404, 'Project not found'));
      }

      const { data, error } = await supabase
        .from('test_suites')
        .delete()
        .eq('id', req.params.id)
        .eq('project_id', req.params.projectId)
        .select()
        .single();

      if (error || !data) {
        return next(new AppError('NOT_FOUND', 404, 'Test suite not found'));
      }

      res.status(200).json({ success: true });
    } catch (err) {
      next(err);
    }
  },
);

export default router;
