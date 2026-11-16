import { Router, type IRouter } from 'express';
import { z } from 'zod';
import { validate } from '../middleware/validation.js';
import { AppError } from '../middleware/error-handler.js';
import { supabase } from '../config/supabase.js';
import { encrypt } from '../utils/encryption.js';
import { isSlackWebhook, loadSlackWebhook, slack } from '../services/notifications.js';

// F10: a project's Slack notice for failed suite runs. Routes nested under
// /projects/:projectId/notifications, pre-protected by `authenticate` and `demoGuard` in app.ts.
//
// HARD RULE: the webhook address is write-only. No response contains it; `hint` is its last 4 characters.

const router: IRouter = Router({ mergeParams: true });

/** Postgres/PostgREST codes for a missing table: migration 31 has not been applied yet. */
const NOT_MIGRATED = ['42P01', 'PGRST205'];
const notMigrated = (error: { code?: string } | null) => !!error && NOT_MIGRATED.includes(error.code ?? '');
const unavailable = () =>
  new AppError('NOT_AVAILABLE', 503, 'Notifications are not available yet: the database is missing migration 31.');

async function ownedProject(projectId: string, userId: string): Promise<{ id: string; name: string } | null> {
  const { data } = await supabase.from('projects').select('id, name').eq('id', projectId).eq('user_id', userId).maybeSingle();
  return data;
}

const saveSchema = z.object({
  webhook_url: z
    .string()
    .trim()
    .max(500)
    .refine(isSlackWebhook, 'Paste a Slack incoming-webhook address. It starts with https://hooks.slack.com/services/'),
});

// ── GET / ─────────────────────────────────────────────────────────────────────

router.get('/', async (req, res, next) => {
  try {
    const { projectId } = req.params as unknown as { projectId: string };
    if (!(await ownedProject(projectId, req.user.id))) return next(new AppError('NOT_FOUND', 404, 'Project not found'));

    const { data, error } = await supabase
      .from('project_notifications')
      .select('slack_webhook_encrypted, updated_at')
      .eq('project_id', projectId)
      .maybeSingle();
    if (error) {
      if (notMigrated(error)) return res.status(200).json({ available: false, slack: { configured: false } });
      return next(error);
    }
    if (!data) return res.status(200).json({ available: true, slack: { configured: false } });

    const address = await loadSlackWebhook(projectId);
    res.status(200).json({ available: true, slack: { configured: true, hint: address?.slice(-4) ?? '', updated_at: data.updated_at } });
  } catch (err) {
    next(err);
  }
});

// ── PUT /slack ────────────────────────────────────────────────────────────────

router.put('/slack', validate(saveSchema), async (req, res, next) => {
  try {
    const { projectId } = req.params as unknown as { projectId: string };
    if (!(await ownedProject(projectId, req.user.id))) return next(new AppError('NOT_FOUND', 404, 'Project not found'));

    const { error } = await supabase.from('project_notifications').upsert(
      {
        project_id: projectId,
        user_id: req.user.id,
        slack_webhook_encrypted: encrypt(req.body.webhook_url),
        updated_at: new Date().toISOString(),
      },
      { onConflict: 'project_id' },
    );
    if (error) return next(notMigrated(error) ? unavailable() : error);

    res.status(200).json({ slack: { configured: true, hint: (req.body.webhook_url as string).slice(-4) } });
  } catch (err) {
    next(err);
  }
});

// ── DELETE /slack ─────────────────────────────────────────────────────────────

router.delete('/slack', async (req, res, next) => {
  try {
    const { projectId } = req.params as unknown as { projectId: string };
    if (!(await ownedProject(projectId, req.user.id))) return next(new AppError('NOT_FOUND', 404, 'Project not found'));

    const { error } = await supabase.from('project_notifications').delete().eq('project_id', projectId);
    if (error) return next(notMigrated(error) ? unavailable() : error);
    res.status(200).json({ slack: { configured: false } });
  } catch (err) {
    next(err);
  }
});

// ── POST /slack/test ──────────────────────────────────────────────────────────
// Sends one message so the owner can see the channel is right before a real failure depends on it.

router.post('/slack/test', async (req, res, next) => {
  try {
    const { projectId } = req.params as unknown as { projectId: string };
    const project = await ownedProject(projectId, req.user.id);
    if (!project) return next(new AppError('NOT_FOUND', 404, 'Project not found'));

    const address = await loadSlackWebhook(projectId);
    if (!address) return next(new AppError('BAD_REQUEST', 400, 'Save a Slack webhook address first'));
    try {
      await slack.post(address, `:white_check_mark: QA Forge will post here when a suite run of ${project.name.replace(/[<>&]/g, ' ')} ends with failures.`);
    } catch (err) {
      // Slack's own reason (e.g. "Slack answered 404") is safe to show; it never includes the address.
      return next(new AppError('BAD_GATEWAY', 502, `Slack did not accept the message: ${err instanceof Error ? err.message : 'unknown error'}`));
    }
    res.status(200).json({ sent: true });
  } catch (err) {
    next(err);
  }
});

export default router;
