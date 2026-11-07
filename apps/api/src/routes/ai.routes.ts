import { Router, type IRouter } from 'express';
import { z } from 'zod';
import { validate } from '../middleware/validation.js';
import { AppError } from '../middleware/error-handler.js';
import { supabase } from '../config/supabase.js';
import {
  LOCAL_DEMO_LABEL,
  LOCAL_DEMO_PROVIDER,
  generateTestCases,
  localDemoTestCases,
  optimizeTestCase,
} from '@qaforge/ai-engine';
import { GeneratedTestCaseSchema } from '@qaforge/shared-types';
import { env } from '../config/env.js';
import logger from '../utils/logger.js';
import { resolveAIKey } from '../utils/resolve-ai-key.js';

// Pre-protected by `authenticate` applied in app.ts.
// AI output is a draft until a person approves it (AI-2): generate and optimize never write;
// approve and apply save only what the user reviewed, validated against the step contract.

const router: IRouter = Router({ mergeParams: true });

async function findOwnedProject(projectId: string, userId: string) {
  const { data: project } = await supabase
    .from('projects')
    .select('id, base_url')
    .eq('id', projectId)
    .eq('user_id', userId)
    .single();
  return project;
}

/** The case, but only through a suite of this (already ownership-checked) project (SEC-2: no IDOR). */
async function findCaseInProject(caseId: string, projectId: string) {
  const { data: testCase, error } = await supabase
    .from('test_cases')
    .select('*, test_suites!inner(project_id)')
    .eq('id', caseId)
    .eq('test_suites.project_id', projectId)
    .single();
  return error ? null : testCase;
}

// ── POST /projects/:projectId/ai/generate → drafts, nothing saved ─────────────

const generateSchema = z.object({
  prompt: z.string().min(10).max(5000),
  provider: z.enum(['openai', 'anthropic', 'gemini', 'openrouter']).optional(),
  model: z.string().min(1).max(100).optional(),
});

router.post('/generate', validate(generateSchema), async (req, res, next) => {
  try {
    const projectId = req.params.projectId as string;
    const project = await findOwnedProject(projectId, req.user.id);
    if (!project) return next(new AppError('NOT_FOUND', 404, 'Project not found'));

    // With AI_LOCAL_DEMO on, a user with no key (who didn't ask for a specific provider) gets
    // the fixed local demo cases instead, which are labelled as not AI.
    const key = await resolveAIKey(req.user.id, req.body.provider).catch((err: unknown) => {
      if (env.AI_LOCAL_DEMO && !req.body.provider && err instanceof AppError && err.statusCode === 400) return null;
      throw err;
    });
    const selectedProvider = key?.provider ?? LOCAL_DEMO_PROVIDER;

    logger.info({ event: 'ai:generate:start', projectId, provider: selectedProvider, promptLength: req.body.prompt.length });

    const result = key
      ? await generateTestCases({
          prompt: req.body.prompt,
          provider: key.provider,
          apiKey: key.apiKey,
          baseUrl: project.base_url ?? undefined,
          model: req.body.model,
        })
      : { test_cases: localDemoTestCases(req.body.prompt), rejected: [], model_used: LOCAL_DEMO_LABEL, generation_time_ms: 0 };

    logger.info({
      event: 'ai:generate:complete',
      projectId,
      provider: selectedProvider,
      casesGenerated: result.test_cases.length,
      casesRejected: result.rejected.length,
      model: result.model_used,
      durationMs: result.generation_time_ms,
    });

    res.status(200).json({
      drafts: result.test_cases,
      rejected: result.rejected,
      provider_used: selectedProvider,
      model_used: result.model_used,
      generation_time_ms: result.generation_time_ms,
    });
  } catch (err) {
    logger.error({ event: 'ai:generate:error', error: err instanceof Error ? err.message : String(err) });
    next(err);
  }
});

// ── POST /projects/:projectId/ai/approve → save reviewed drafts ───────────────

const approveSchema = z
  .object({
    suite_id: z.string().uuid().optional(),
    suite_name: z.string().trim().min(1).max(200).optional(),
    /** false for local demo cases, which are not AI output */
    ai_generated: z.boolean().default(true),
    test_cases: z.array(GeneratedTestCaseSchema).min(1).max(50),
  })
  .refine((b) => !(b.suite_id && b.suite_name), { message: 'Give suite_id or suite_name, not both' });

router.post('/approve', validate(approveSchema), async (req, res, next) => {
  try {
    const projectId = req.params.projectId as string;
    const body = req.body as z.infer<typeof approveSchema>;
    if (!(await findOwnedProject(projectId, req.user.id))) {
      return next(new AppError('NOT_FOUND', 404, 'Project not found'));
    }

    // Everything is validated before the first write, so a bad request leaves no orphan suite.
    let suiteId = body.suite_id;
    let createdSuite = false;
    if (suiteId) {
      const { data: suite } = await supabase.from('test_suites').select('id').eq('id', suiteId).eq('project_id', projectId).single();
      if (!suite) return next(new AppError('NOT_FOUND', 404, 'Test suite not found'));
    } else {
      const now = new Date().toISOString();
      const { data: suite, error } = await supabase
        .from('test_suites')
        .insert({
          project_id: projectId,
          name: body.suite_name ?? `AI generated ${now.slice(0, 10)}`,
          description: 'Generated test cases, reviewed and approved',
          created_at: now,
          updated_at: now,
        })
        .select('id')
        .single();
      if (error || !suite) return next(new AppError('INTERNAL_ERROR', 500, 'Failed to create suite'));
      suiteId = suite.id;
      createdSuite = true;
    }

    const now = new Date().toISOString();
    const { data: saved, error: insertError } = await supabase
      .from('test_cases')
      .insert(
        body.test_cases.map((tc) => ({
          suite_id: suiteId,
          title: tc.title,
          description: tc.description || null,
          steps: tc.steps,
          expected_result: tc.expected_result || null,
          priority: tc.priority,
          type: tc.type,
          tags: tc.tags,
          is_ai_generated: body.ai_generated,
          source: body.ai_generated ? ('ai_generated' as const) : ('manual' as const),
          created_at: now,
          updated_at: now,
        })),
      )
      .select('id, title, steps');

    if (insertError) {
      if (createdSuite) await supabase.from('test_suites').delete().eq('id', suiteId!);
      return next(new AppError('INTERNAL_ERROR', 500, 'Failed to save the approved test cases'));
    }

    res.status(201).json({ suite_id: suiteId, test_cases: saved ?? [] });
  } catch (err) {
    next(err);
  }
});

// ── POST /projects/:projectId/ai/optimize/:caseId → draft, nothing saved ──────

const optimizeParamsSchema = z.object({
  projectId: z.string().uuid(),
  caseId: z.string().uuid(),
});

router.post('/optimize/:caseId', validate(optimizeParamsSchema, 'params'), async (req, res, next) => {
  try {
    const { projectId, caseId } = req.params as z.infer<typeof optimizeParamsSchema>;
    const project = await findOwnedProject(projectId, req.user.id);
    if (!project) return next(new AppError('NOT_FOUND', 404, 'Project not found'));
    const testCase = await findCaseInProject(caseId, projectId);
    if (!testCase) return next(new AppError('NOT_FOUND', 404, 'Test case not found'));

    const { provider: selectedProvider, apiKey: rawApiKey } = await resolveAIKey(req.user.id);
    const result = await optimizeTestCase({
      title: testCase.title,
      description: testCase.description || undefined,
      steps: testCase.steps || [],
      expected_result: testCase.expected_result || undefined,
      provider: selectedProvider,
      apiKey: rawApiKey,
      baseUrl: project.base_url || undefined,
    });

    res.status(200).json({
      draft: result.test_case,
      provider_used: selectedProvider,
      model_used: result.model_used,
      optimization_time_ms: result.optimization_time_ms,
    });
  } catch (err) {
    logger.error({ event: 'ai:optimize:error', error: err instanceof Error ? err.message : String(err) });
    next(err);
  }
});

// ── POST /projects/:projectId/ai/optimize/:caseId/apply → save the reviewed draft

router.post(
  '/optimize/:caseId/apply',
  validate(optimizeParamsSchema, 'params'),
  validate(GeneratedTestCaseSchema),
  async (req, res, next) => {
    try {
      const { projectId, caseId } = req.params as z.infer<typeof optimizeParamsSchema>;
      if (!(await findOwnedProject(projectId, req.user.id))) {
        return next(new AppError('NOT_FOUND', 404, 'Project not found'));
      }
      if (!(await findCaseInProject(caseId, projectId))) {
        return next(new AppError('NOT_FOUND', 404, 'Test case not found'));
      }

      const draft = req.body as z.infer<typeof GeneratedTestCaseSchema>;
      const { data: updatedCase, error } = await supabase
        .from('test_cases')
        .update({
          title: draft.title,
          description: draft.description || null,
          steps: draft.steps,
          expected_result: draft.expected_result || null,
          priority: draft.priority,
          type: draft.type,
          tags: draft.tags,
          is_ai_generated: true,
          updated_at: new Date().toISOString(),
        })
        .eq('id', caseId)
        .select()
        .single();
      if (error || !updatedCase) return next(new AppError('INTERNAL_ERROR', 500, 'Failed to save the optimized test case'));

      res.status(200).json({ test_case: updatedCase });
    } catch (err) {
      next(err);
    }
  },
);

export default router;
