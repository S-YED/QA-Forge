import { Router, type IRouter } from 'express';
import { z } from 'zod';
import { validate } from '../middleware/validation.js';
import { AppError } from '../middleware/error-handler.js';
import { supabase } from '../config/supabase.js';
import { decrypt, encrypt } from '../utils/encryption.js';
import { VARIABLE_NAME } from '../services/run-variables.js';

// F4: project variables and secrets. Routes nested under /projects/:projectId/variables,
// pre-protected by `authenticate` and `demoGuard` in app.ts.
//
// HARD RULE: a secret's value is write-only. It is never selected into a response, and a secret
// cannot be switched to "not secret" without typing a new value (that would reveal the old one).

const router: IRouter = Router({ mergeParams: true });

const uuidParamsSchema = z.object({ id: z.guid() });
const name = z.string().regex(VARIABLE_NAME, 'Use capital letters, digits and underscores, starting with a letter, e.g. ADMIN_PASSWORD');
const value = z.string().min(1, 'Give the variable a value').max(4000);

const createSchema = z.object({ name, value, is_secret: z.boolean().optional().default(true) });
const updateSchema = z
  .object({ name: name.optional(), value: value.optional(), is_secret: z.boolean().optional() })
  .refine((b) => b.name !== undefined || b.value !== undefined || b.is_secret !== undefined, { message: 'Nothing to change' });

/** Postgres/PostgREST codes for a missing table: migration 27 has not been applied yet. */
const NOT_MIGRATED = ['42P01', 'PGRST205'];
const dbError = (error: { code?: string; message?: string } | null, fallback: string) => {
  if (error && NOT_MIGRATED.includes(error.code ?? '')) {
    return new AppError('NOT_AVAILABLE', 503, 'Variables are not available yet: the database is missing migration 27.');
  }
  if (error?.code === '23505') return new AppError('CONFLICT', 409, 'This project already has a variable with that name');
  return error ?? new AppError('INTERNAL_ERROR', 500, fallback);
};

interface Row {
  id: string;
  name: string;
  value_encrypted: string;
  is_secret: boolean;
  updated_at: string;
}

/** What a client may see: a secret shows that it has a value, never the value. */
const present = (row: Row) => ({
  id: row.id,
  name: row.name,
  is_secret: row.is_secret,
  value: row.is_secret ? null : decrypt(row.value_encrypted),
  updated_at: row.updated_at,
});

const COLUMNS = 'id, name, value_encrypted, is_secret, updated_at';

async function ownsProject(projectId: string, userId: string): Promise<boolean> {
  const { data } = await supabase.from('projects').select('id').eq('id', projectId).eq('user_id', userId).maybeSingle();
  return !!data;
}

// ── GET /projects/:projectId/variables ────────────────────────────────────────

router.get('/', async (req, res, next) => {
  try {
    const projectId = (req.params as { projectId: string }).projectId;
    if (!(await ownsProject(projectId, req.user.id))) return next(new AppError('NOT_FOUND', 404, 'Project not found'));
    const { data, error } = await supabase.from('project_variables').select(COLUMNS).eq('project_id', projectId).order('name');
    if (error) {
      // Before migration 27 there are simply no variables to list.
      if (NOT_MIGRATED.includes(error.code)) return res.status(200).json({ variables: [], available: false });
      return next(error);
    }
    res.status(200).json({ variables: (data as Row[]).map(present), available: true });
  } catch (err) {
    next(err);
  }
});

// ── POST /projects/:projectId/variables ───────────────────────────────────────

router.post('/', validate(createSchema), async (req, res, next) => {
  try {
    const projectId = (req.params as { projectId: string }).projectId;
    if (!(await ownsProject(projectId, req.user.id))) return next(new AppError('NOT_FOUND', 404, 'Project not found'));
    const { data, error } = await supabase
      .from('project_variables')
      .insert({ project_id: projectId, name: req.body.name, value_encrypted: encrypt(req.body.value), is_secret: req.body.is_secret })
      .select(COLUMNS)
      .single();
    if (error || !data) return next(dbError(error, 'Could not save the variable'));
    res.status(201).json({ variable: present(data as Row) });
  } catch (err) {
    next(err);
  }
});

// ── PUT /projects/:projectId/variables/:id ────────────────────────────────────

router.put('/:id', validate(uuidParamsSchema, 'params'), validate(updateSchema), async (req, res, next) => {
  try {
    const projectId = (req.params as { projectId: string }).projectId;
    if (!(await ownsProject(projectId, req.user.id))) return next(new AppError('NOT_FOUND', 404, 'Project not found'));

    const { data: current, error: readError } = await supabase
      .from('project_variables')
      .select('id, is_secret')
      .eq('id', req.params.id)
      .eq('project_id', projectId)
      .maybeSingle();
    if (readError) return next(dbError(readError, 'Could not load the variable'));
    if (!current) return next(new AppError('NOT_FOUND', 404, 'Variable not found'));

    if (current.is_secret && req.body.is_secret === false && req.body.value === undefined) {
      return next(new AppError('BAD_REQUEST', 400, 'Type a new value to make this variable visible; a saved secret is never shown'));
    }

    const { data, error } = await supabase
      .from('project_variables')
      .update({
        ...(req.body.name !== undefined && { name: req.body.name }),
        ...(req.body.value !== undefined && { value_encrypted: encrypt(req.body.value) }),
        ...(req.body.is_secret !== undefined && { is_secret: req.body.is_secret }),
      })
      .eq('id', current.id)
      .eq('project_id', projectId)
      .select(COLUMNS)
      .single();
    if (error || !data) return next(dbError(error, 'Could not save the variable'));
    res.status(200).json({ variable: present(data as Row) });
  } catch (err) {
    next(err);
  }
});

// ── DELETE /projects/:projectId/variables/:id ─────────────────────────────────

router.delete('/:id', validate(uuidParamsSchema, 'params'), async (req, res, next) => {
  try {
    const projectId = (req.params as { projectId: string }).projectId;
    if (!(await ownsProject(projectId, req.user.id))) return next(new AppError('NOT_FOUND', 404, 'Project not found'));
    const { data, error } = await supabase
      .from('project_variables')
      .delete()
      .eq('id', req.params.id)
      .eq('project_id', projectId)
      .select('id');
    if (error) return next(dbError(error, 'Could not delete the variable'));
    if (!data?.length) return next(new AppError('NOT_FOUND', 404, 'Variable not found'));
    res.status(204).end();
  } catch (err) {
    next(err);
  }
});

export default router;
