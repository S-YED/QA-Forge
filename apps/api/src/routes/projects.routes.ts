import { Router, type IRouter } from 'express';
import { z } from 'zod';
import { httpUrl, validate } from '../middleware/validation.js';
import { AppError } from '../middleware/error-handler.js';
import { supabase } from '../config/supabase.js';
import { isTimezone } from '../services/schedules.js';

// All routes in this router are pre-protected by `authenticate` applied in app.ts.

const router: IRouter = Router();

const uuidParamsSchema = z.object({ id: z.guid() });

// ── GET / ──────────────────────────────────────────────────────────────────────

router.get('/', async (req, res, next) => {
  try {
    const { data: rows, error } = await supabase
      .from('projects')
      .select('*, test_suites(test_cases(count))')
      .eq('user_id', req.user.id)
      .order('created_at', { ascending: false });

    if (error) return next(error);

    // U1: how many test cases each project has, for the first-run checklist (counted by the database).
    type Row = { id: string; test_suites?: { test_cases?: { count: number }[] }[] };
    const projects = ((rows ?? []) as Row[]).map(({ test_suites, ...p }) => ({
      ...p,
      case_count: (test_suites ?? []).reduce((n, s) => n + (s.test_cases?.[0]?.count ?? 0), 0),
    }));

    // F5: 30-day counts and last run per project for the cards. Left out (not an error) until migration 30 exists.
    const { data: health } = await supabase.rpc('projects_health', { p_user_id: req.user.id });
    const byProject = new Map(((health ?? []) as { project_id: string }[]).map(({ project_id, ...h }) => [project_id, h]));
    const withHealth = projects.map((p) => ({ ...p, health: byProject.get(p.id) ?? null }));

    res.status(200).json({ projects: withHealth, count: withHealth.length });
  } catch (err) {
    next(err);
  }
});

// ── POST / ────────────────────────────────────────────────────────────────────

const createProjectSchema = z.object({
  name: z.string().min(1).max(200),
  description: z.string().max(1000).optional(),
  base_url: httpUrl().optional(),
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

      // Counted by the database: loading the rows and counting here stopped at the 1000-row page limit.
      const countRuns = async (status?: string) => {
        let q = supabase.from('test_runs').select('id', { count: 'exact', head: true }).eq('project_id', req.params.id);
        if (status) q = q.eq('status', status);
        return (await q).count ?? 0;
      };
      const [total_runs, passed_runs, failed_runs] = await Promise.all([countRuns(), countRuns('passed'), countRuns('failed')]);

      res.status(200).json({ project, stats: { total_runs, passed_runs, failed_runs } });
    } catch (err) {
      next(err);
    }
  },
);

// ── GET /:id/overview ─────────────────────────────────────────────────────────
// F5: pass rate over 30 days, runs per day for 14 days, last result per case. `tz` is the viewer's
// timezone so "today" is their today. Answers available:false until the database has migration 30.

const overviewQuerySchema = z.object({ tz: z.string().max(64).optional() });

router.get(
  '/:id/overview',
  validate(uuidParamsSchema, 'params'),
  validate(overviewQuerySchema, 'query'),
  async (req, res, next) => {
    try {
      const { data: project } = await supabase
        .from('projects')
        .select('id')
        .eq('id', req.params.id)
        .eq('user_id', req.user.id)
        .single();
      if (!project) return next(new AppError('NOT_FOUND', 404, 'Project not found'));

      const tz = typeof req.query.tz === 'string' && isTimezone(req.query.tz) ? req.query.tz : 'UTC';
      const { data, error } = await supabase.rpc('project_overview', { p_project_id: req.params.id, p_tz: tz });
      if (error) {
        // PGRST202 / 42883: the function is not there yet.
        if (['PGRST202', '42883'].includes(error.code)) return res.status(200).json({ available: false });
        return next(error);
      }
      res.status(200).json({ available: true, ...(data as object) });
    } catch (err) {
      next(err);
    }
  },
);

// ── PUT /:id ──────────────────────────────────────────────────────────────────

const updateProjectSchema = z.object({
  name: z.string().min(1).max(200).optional(),
  description: z.string().max(1000).optional().nullable(),
  base_url: httpUrl().optional().nullable(),
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
