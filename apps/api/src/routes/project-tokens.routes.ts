import { createHash, randomBytes } from 'node:crypto';
import { Router, type IRouter, type NextFunction, type Request, type Response } from 'express';
import { z } from 'zod';
import { validate } from '../middleware/validation.js';
import { AppError } from '../middleware/error-handler.js';
import { supabase } from '../config/supabase.js';
import { readSuiteRun, startSuiteRun } from '../services/suite-runs.js';

// F8: run a suite from CI.
//
//  - `tokensRouter` (/projects/:projectId/tokens, signed-in owner): create, list and delete project tokens.
//  - `ciRouter` (/ci, token only): start a suite run and read its result.
//
// HARD RULES: the token is returned once, at creation. Only its SHA-256 hash is stored, it is never
// selected into a response and never logged. A token acts only on its own project.

const hashToken = (token: string) => createHash('sha256').update(token).digest('hex');
const TOKEN = /^qf_[A-Za-z0-9_-]{40,}$/;

/** Postgres/PostgREST codes for a missing table: migration 28 has not been applied yet. */
const NOT_MIGRATED = ['42P01', 'PGRST205'];
const notMigrated = () => new AppError('NOT_AVAILABLE', 503, 'CI tokens are not available yet: the database is missing migration 28.');

// ── Token management (signed-in owner) ────────────────────────────────────────

export const tokensRouter: IRouter = Router({ mergeParams: true });

const uuidParamsSchema = z.object({ id: z.guid() });
const createSchema = z.object({ name: z.string().trim().min(1, 'Give the token a name, e.g. GitHub Actions').max(80) });
const LISTED = 'id, name, token_prefix, last_used_at, created_at';
const projectOf = (req: Request) => (req.params as { projectId: string }).projectId;

async function ownsProject(projectId: string, userId: string): Promise<boolean> {
  const { data } = await supabase.from('projects').select('id').eq('id', projectId).eq('user_id', userId).maybeSingle();
  return !!data;
}

tokensRouter.get('/', async (req, res, next) => {
  try {
    const projectId = projectOf(req);
    if (!(await ownsProject(projectId, req.user.id))) return next(new AppError('NOT_FOUND', 404, 'Project not found'));
    const { data, error } = await supabase
      .from('project_tokens')
      .select(LISTED)
      .eq('project_id', projectId)
      .eq('user_id', req.user.id)
      .order('created_at', { ascending: false });
    if (error) {
      if (NOT_MIGRATED.includes(error.code)) return res.status(200).json({ tokens: [], available: false });
      return next(error);
    }
    res.status(200).json({ tokens: data ?? [], available: true });
  } catch (err) {
    next(err);
  }
});

tokensRouter.post('/', validate(createSchema), async (req, res, next) => {
  try {
    const projectId = projectOf(req);
    if (!(await ownsProject(projectId, req.user.id))) return next(new AppError('NOT_FOUND', 404, 'Project not found'));
    const token = `qf_${randomBytes(32).toString('base64url')}`;
    const { data, error } = await supabase
      .from('project_tokens')
      .insert({
        project_id: projectId,
        user_id: req.user.id,
        name: req.body.name,
        token_hash: hashToken(token),
        token_prefix: token.slice(0, 10),
      })
      .select(LISTED)
      .single();
    if (error || !data) {
      return next(error && NOT_MIGRATED.includes(error.code) ? notMigrated() : (error ?? new AppError('INTERNAL_ERROR', 500, 'Could not create the token')));
    }
    // The only time the token itself leaves the API.
    res.status(201).json({ token: data, secret: token });
  } catch (err) {
    next(err);
  }
});

tokensRouter.delete('/:id', validate(uuidParamsSchema, 'params'), async (req, res, next) => {
  try {
    const projectId = projectOf(req);
    if (!(await ownsProject(projectId, req.user.id))) return next(new AppError('NOT_FOUND', 404, 'Project not found'));
    const { data, error } = await supabase
      .from('project_tokens')
      .delete()
      .eq('id', (req.params as { id: string }).id)
      .eq('project_id', projectId)
      .eq('user_id', req.user.id)
      .select('id');
    if (error) return next(NOT_MIGRATED.includes(error.code) ? notMigrated() : error);
    if (!data?.length) return next(new AppError('NOT_FOUND', 404, 'Token not found'));
    res.status(204).end();
  } catch (err) {
    next(err);
  }
});

// ── CI routes (token only) ────────────────────────────────────────────────────

export const ciRouter: IRouter = Router();

interface CiAuth {
  projectId: string;
  userId: string;
}
const UNAUTHORIZED = () => new AppError('UNAUTHORIZED', 401, 'Missing or invalid project token. Send it as: Authorization: Bearer qf_...');

/** Resolve `Authorization: Bearer qf_...` to the token's project and owner, or answer 401. */
async function authenticateToken(req: Request, res: Response, next: NextFunction) {
  try {
    const token = /^Bearer (\S+)$/.exec(req.headers.authorization ?? '')?.[1] ?? '';
    if (!TOKEN.test(token)) return next(UNAUTHORIZED());
    const { data, error } = await supabase
      .from('project_tokens')
      .select('id, project_id, user_id')
      .eq('token_hash', hashToken(token))
      .maybeSingle();
    if (error && NOT_MIGRATED.includes(error.code)) return next(notMigrated());
    if (!data) return next(UNAUTHORIZED());
    res.locals.ci = { projectId: data.project_id, userId: data.user_id } satisfies CiAuth;
    // Shown in the token list; a failure to record it must not fail the request.
    void supabase.from('project_tokens').update({ last_used_at: new Date().toISOString() }).eq('id', data.id).then(() => {});
    next();
  } catch (err) {
    next(err);
  }
}

ciRouter.use(authenticateToken);

const suiteParams = z.object({ suiteId: z.guid() });
const batchParams = z.object({ id: z.guid() });

// POST /ci/suites/:suiteId/run — start a suite run; answers at once with where to read the result.
ciRouter.post('/suites/:suiteId/run', validate(suiteParams, 'params'), async (req, res, next) => {
  try {
    const ci = res.locals.ci as CiAuth;
    const { batchId, runIds } = await startSuiteRun(req.app.get('io'), ci.userId, ci.projectId, (req.params as { suiteId: string }).suiteId);
    res.status(201).json({ batch_id: batchId, total: runIds.length, status_path: `/api/ci/batches/${batchId}` });
  } catch (err) {
    next(err);
  }
});

// GET /ci/batches/:id — `status` is running until every case has ended, then passed only if all passed.
ciRouter.get('/batches/:id', validate(batchParams, 'params'), async (req, res, next) => {
  try {
    const ci = res.locals.ci as CiAuth;
    const found = await readSuiteRun((req.params as { id: string }).id, ci.projectId);
    if (!found) return next(new AppError('NOT_FOUND', 404, 'Suite run not found'));
    const { counts } = found;
    const status = counts.pending + counts.running > 0 ? 'running' : counts.passed === counts.total ? 'passed' : 'failed';
    res.status(200).json({
      batch_id: found.batch.id,
      suite: (found.batch.test_suites as { name?: string } | null)?.name ?? null,
      status,
      counts,
      runs: found.runs.map((r) => ({
        id: r.id,
        title: (r.test_cases as { title?: string } | null)?.title ?? null,
        status: r.status,
        duration_ms: r.duration_ms,
        error_message: r.error_message,
      })),
    });
  } catch (err) {
    next(err);
  }
});
