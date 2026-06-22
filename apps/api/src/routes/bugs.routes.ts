import { Router, type IRouter } from 'express';
import { z } from 'zod';
import { validate } from '../middleware/validation.js';
import { AppError } from '../middleware/error-handler.js';
import { supabase } from '../config/supabase.js';

// All routes nested under /projects/:projectId/bugs
// Pre-protected by `authenticate` applied in app.ts.

const router: IRouter = Router({ mergeParams: true });

const uuidParamsSchema = z.object({ id: z.string().uuid() });

// ── GET /projects/:projectId/bugs ─────────────────────────────────────────────

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

    // Optional status filter
    let query = supabase
      .from('bugs')
      .select('*', { count: 'exact' })
      .eq('project_id', projectId)
      .order('created_at', { ascending: false })
      .range(from, to);

    if (req.query.status) {
      query = query.eq('status', req.query.status as string);
    }

    if (req.query.severity) {
      query = query.eq('severity', req.query.severity as string);
    }

    const { data: bugs, error, count } = await query;

    if (error) return next(error);

    res.status(200).json({
      bugs: bugs ?? [],
      count: count ?? 0,
      page,
      per_page: perPage,
    });
  } catch (err) {
    next(err);
  }
});

// ── GET /projects/:projectId/bugs/:id ─────────────────────────────────────────

router.get(
  '/:id',
  validate(uuidParamsSchema, 'params'),
  async (req, res, next) => {
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

      const { data: bug, error } = await supabase
        .from('bugs')
        .select('*')
        .eq('id', req.params.id)
        .eq('project_id', projectId)
        .single();

      if (error || !bug) {
        return next(new AppError('NOT_FOUND', 404, 'Bug not found'));
      }

      res.status(200).json({ bug });
    } catch (err) {
      next(err);
    }
  },
);

// ── POST /projects/:projectId/bugs ────────────────────────────────────────────

const createBugSchema = z.object({
  test_run_id: z.string().uuid().optional(),
  title: z.string().min(1).max(500),
  description: z.string().max(5000).optional(),
  steps_to_reproduce: z.string().max(5000).optional(),
  expected_behavior: z.string().max(2000).optional(),
  actual_behavior: z.string().max(2000).optional(),
  severity: z.enum(['critical', 'high', 'medium', 'low']).optional().default('medium'),
  screenshot_urls: z.array(z.string().url()).optional().default([]),
  environment: z.string().max(200).optional(),
  browser: z.string().max(100).optional(),
});

router.post('/', validate(createBugSchema), async (req, res, next) => {
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

    const now = new Date().toISOString();

    const { data: bug, error } = await supabase
      .from('bugs')
      .insert({
        project_id: projectId,
        test_run_id: req.body.test_run_id ?? null,
        title: req.body.title,
        description: req.body.description ?? null,
        steps_to_reproduce: req.body.steps_to_reproduce ?? null,
        expected_behavior: req.body.expected_behavior ?? null,
        actual_behavior: req.body.actual_behavior ?? null,
        severity: req.body.severity,
        status: 'open',
        screenshot_urls: req.body.screenshot_urls,
        environment: req.body.environment ?? null,
        browser: req.body.browser ?? null,
        created_at: now,
        updated_at: now,
      })
      .select()
      .single();

    if (error || !bug) {
      return next(error ?? new AppError('INTERNAL_ERROR', 500, 'Failed to create bug'));
    }

    res.status(201).json({ bug });
  } catch (err) {
    next(err);
  }
});

// ── PUT /projects/:projectId/bugs/:id ─────────────────────────────────────────

const updateBugSchema = z.object({
  title: z.string().min(1).max(500).optional(),
  description: z.string().max(5000).optional().nullable(),
  severity: z.enum(['critical', 'high', 'medium', 'low']).optional(),
  status: z.enum(['open', 'in_progress', 'resolved', 'closed', 'wont_fix']).optional(),
  assigned_to: z.string().uuid().optional().nullable(),
});

router.put(
  '/:id',
  validate(uuidParamsSchema, 'params'),
  validate(updateBugSchema),
  async (req, res, next) => {
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

      const { data: bug, error } = await supabase
        .from('bugs')
        .update({
          ...req.body,
          updated_at: new Date().toISOString(),
        })
        .eq('id', req.params.id)
        .eq('project_id', projectId)
        .select()
        .single();

      if (error || !bug) {
        return next(new AppError('NOT_FOUND', 404, 'Bug not found'));
      }

      res.status(200).json({ bug });
    } catch (err) {
      next(err);
    }
  },
);

export default router;
