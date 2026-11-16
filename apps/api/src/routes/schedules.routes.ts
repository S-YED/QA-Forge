import { Router, type IRouter, type Request } from 'express';
import { z } from 'zod';
import { validate } from '../middleware/validation.js';
import { AppError } from '../middleware/error-handler.js';
import { supabase } from '../config/supabase.js';
import { isTimezone, nextRunAt } from '../services/schedules.js';
import { isNotMigrated } from '../services/suite-runs.js';

// F9: scheduled suite runs. Routes nested under /projects/:projectId/schedules, pre-protected by
// `authenticate` and `demoGuard` in app.ts. One schedule per suite, addressed by the suite's id.

const router: IRouter = Router({ mergeParams: true });

const suiteParams = z.object({ suiteId: z.guid() });
const scheduleSchema = z
  .object({
    frequency: z.enum(['daily', 'weekly']),
    hour: z.number().int().min(0).max(23),
    weekday: z.number().int().min(0).max(6).nullable().optional(),
    timezone: z.string().max(64).refine(isTimezone, 'Unknown timezone'),
    enabled: z.boolean().optional().default(true),
  })
  .refine((s) => s.frequency === 'daily' || s.weekday != null, { message: 'Choose a day of the week', path: ['weekday'] });

const notMigrated = () => new AppError('NOT_AVAILABLE', 503, 'Schedules are not available yet: the database is missing migration 29.');
const COLUMNS = 'id, suite_id, frequency, hour, weekday, timezone, enabled, next_run_at, last_run_at, last_batch_id';
const ids = (req: Request) => req.params as { projectId: string; suiteId: string };

async function ownsProject(projectId: string, userId: string): Promise<boolean> {
  const { data } = await supabase.from('projects').select('id').eq('id', projectId).eq('user_id', userId).maybeSingle();
  return !!data;
}

// ── GET /projects/:projectId/schedules ────────────────────────────────────────

router.get('/', async (req, res, next) => {
  try {
    const { projectId } = ids(req);
    if (!(await ownsProject(projectId, req.user.id))) return next(new AppError('NOT_FOUND', 404, 'Project not found'));
    const { data, error } = await supabase.from('suite_schedules').select(COLUMNS).eq('project_id', projectId).eq('user_id', req.user.id);
    if (error) {
      if (isNotMigrated(error)) return res.status(200).json({ schedules: [], available: false });
      return next(error);
    }
    res.status(200).json({ schedules: data ?? [], available: true });
  } catch (err) {
    next(err);
  }
});

// ── PUT /projects/:projectId/schedules/:suiteId ───────────────────────────────
// Creates the suite's schedule or replaces it. The next run is worked out from now.

router.put('/:suiteId', validate(suiteParams, 'params'), validate(scheduleSchema), async (req, res, next) => {
  try {
    const { projectId, suiteId } = ids(req);
    if (!(await ownsProject(projectId, req.user.id))) return next(new AppError('NOT_FOUND', 404, 'Project not found'));
    const { data: suite } = await supabase.from('test_suites').select('id').eq('id', suiteId).eq('project_id', projectId).maybeSingle();
    if (!suite) return next(new AppError('NOT_FOUND', 404, 'Suite not found'));

    const rule = {
      frequency: req.body.frequency,
      hour: req.body.hour,
      weekday: req.body.frequency === 'weekly' ? req.body.weekday : null,
      timezone: req.body.timezone,
    };
    const { data, error } = await supabase
      .from('suite_schedules')
      .upsert(
        { project_id: projectId, suite_id: suiteId, user_id: req.user.id, ...rule, enabled: req.body.enabled, next_run_at: nextRunAt(rule, new Date()).toISOString() },
        { onConflict: 'suite_id' },
      )
      .select(COLUMNS)
      .single();
    if (error || !data) return next(isNotMigrated(error) ? notMigrated() : (error ?? new AppError('INTERNAL_ERROR', 500, 'Could not save the schedule')));
    res.status(200).json({ schedule: data });
  } catch (err) {
    next(err);
  }
});

// ── DELETE /projects/:projectId/schedules/:suiteId ────────────────────────────

router.delete('/:suiteId', validate(suiteParams, 'params'), async (req, res, next) => {
  try {
    const { projectId, suiteId } = ids(req);
    if (!(await ownsProject(projectId, req.user.id))) return next(new AppError('NOT_FOUND', 404, 'Project not found'));
    const { data, error } = await supabase
      .from('suite_schedules')
      .delete()
      .eq('suite_id', suiteId)
      .eq('project_id', projectId)
      .eq('user_id', req.user.id)
      .select('id');
    if (error) return next(isNotMigrated(error) ? notMigrated() : error);
    if (!data?.length) return next(new AppError('NOT_FOUND', 404, 'This suite has no schedule'));
    res.status(204).end();
  } catch (err) {
    next(err);
  }
});

export default router;
