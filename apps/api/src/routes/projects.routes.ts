import { Router, type IRouter } from 'express';
import { z } from 'zod';
import { validate } from '../middleware/validation.js';
import { AppError } from '../middleware/error-handler.js';
import { supabase } from '../config/supabase.js';

// All routes in this router are pre-protected by `authenticate` applied in app.ts.

const router: IRouter = Router();

const uuidParamsSchema = z.object({ id: z.string().uuid() });

// ── GET / ──────────────────────────────────────────────────────────────────────

router.get('/', async (req, res, next) => {
  try {
    const { data: projects, error } = await supabase
      .from('projects')
      .select('*')
      .eq('user_id', req.user.id)
      .order('created_at', { ascending: false });

    if (error) return next(error);

    res.status(200).json({ projects, count: projects?.length ?? 0 });
  } catch (err) {
    next(err);
  }
});

// ── POST / ────────────────────────────────────────────────────────────────────

const createProjectSchema = z.object({
  name: z.string().min(1).max(200),
  description: z.string().max(1000).optional(),
  base_url: z.string().url().optional(),
});

router.post('/', validate(createProjectSchema), async (req, res, next) => {
  try {
    const now = new Date().toISOString();

    const { data: project, error } = await supabase
      .from('projects')
      .insert({
        user_id: req.user.id,
        name: req.body.name,
        description: req.body.description ?? null,
        base_url: req.body.base_url ?? null,
        created_at: now,
        updated_at: now,
      })
      .select()
      .single();

    if (error || !project) return next(error ?? new AppError('INTERNAL_ERROR', 500, 'Failed to create project'));

    res.status(201).json({ project });
  } catch (err) {
    next(err);
  }
});

// ── GET /:id ──────────────────────────────────────────────────────────────────

router.get(
  '/:id',
  validate(uuidParamsSchema, 'params'),
  async (req, res, next) => {
    try {
      // Ownership check in query — defense-in-depth beyond RLS
      const { data: project, error } = await supabase
        .from('projects')
        .select('*')
        .eq('id', req.params.id)
        .eq('user_id', req.user.id)
        .single();

      if (error || !project) {
        return next(new AppError('NOT_FOUND', 404, 'Project not found'));
      }

      // Aggregate basic run stats
      const { data: runs } = await supabase
        .from('test_runs')
        .select('status')
        .eq('project_id', req.params.id);

      const stats = {
        total_runs: runs?.length ?? 0,
        passed_runs: runs?.filter((r) => r.status === 'passed').length ?? 0,
        failed_runs: runs?.filter((r) => r.status === 'failed').length ?? 0,
      };

      res.status(200).json({ project, stats });
    } catch (err) {
      next(err);
    }
  },
);

// ── PUT /:id ──────────────────────────────────────────────────────────────────

const updateProjectSchema = z.object({
  name: z.string().min(1).max(200).optional(),
  description: z.string().max(1000).optional().nullable(),
  base_url: z.string().url().optional().nullable(),
});

router.put(
  '/:id',
  validate(uuidParamsSchema, 'params'),
  validate(updateProjectSchema),
  async (req, res, next) => {
    try {
      const { data: project, error } = await supabase
        .from('projects')
        .update({
          ...req.body,
          updated_at: new Date().toISOString(),
        })
        .eq('id', req.params.id)
        .eq('user_id', req.user.id)
        .select()
        .single();

      if (error || !project) {
        return next(new AppError('NOT_FOUND', 404, 'Project not found'));
      }

      res.status(200).json({ project });
    } catch (err) {
      next(err);
    }
  },
);

// ── DELETE /:id ───────────────────────────────────────────────────────────────

router.delete(
  '/:id',
  validate(uuidParamsSchema, 'params'),
  async (req, res, next) => {
    try {
      const { data, error } = await supabase
        .from('projects')
        .delete()
        .eq('id', req.params.id)
        .eq('user_id', req.user.id)
        .select()
        .single();

      if (error || !data) {
        return next(new AppError('NOT_FOUND', 404, 'Project not found'));
      }

      res.status(200).json({ success: true });
    } catch (err) {
      next(err);
    }
  },
);

export default router;
