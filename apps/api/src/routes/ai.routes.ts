import { Router, type IRouter } from 'express';
import { z } from 'zod';
import { validate } from '../middleware/validation.js';
import { AppError } from '../middleware/error-handler.js';
import { supabase } from '../config/supabase.js';
import { generateTestCases, optimizeTestCase } from '@qaforge/ai-engine';
import logger from '../utils/logger.js';
import { resolveAIKey } from '../utils/resolve-ai-key.js';
import { ApiKeyProvider } from '@qaforge/shared-types';

// Pre-protected by `authenticate` applied in app.ts.

const router: IRouter = Router({ mergeParams: true });

// ── POST /projects/:projectId/ai/generate ─────────────────────────────────────

const generateSchema = z.object({
  prompt: z.string().min(10).max(5000),
  suite_id: z.string().uuid().optional(),
  suite_name: z.string().min(1).max(200).optional(),
  provider: z.enum(['openai', 'anthropic', 'gemini']).optional(),
});

router.post('/generate', validate(generateSchema), async (req, res, next) => {
  try {
    const projectId = req.params.projectId;

    // 1. Verify project ownership
    const { data: project } = await supabase
      .from('projects')
      .select('id, base_url')
      .eq('id', projectId)
      .eq('user_id', req.user.id)
      .single();

    if (!project) {
      return next(new AppError('NOT_FOUND', 404, 'Project not found'));
    }

    // 2. Resolve AI provider key
    const { provider: selectedProvider, apiKey: rawApiKey } = await resolveAIKey(
      req.user.id,
      req.body.provider,
    );

    // 3. Resolve or create suite
    let suiteId: string;

    if (req.body.suite_id) {
      // Verify suite belongs to project
      const { data: suite } = await supabase
        .from('test_suites')
        .select('id')
        .eq('id', req.body.suite_id)
        .eq('project_id', projectId)
        .single();

      if (!suite) {
        return next(new AppError('NOT_FOUND', 404, 'Test suite not found'));
      }

      suiteId = req.body.suite_id;
    } else {
      // Create a new suite
      const suiteName = req.body.suite_name || `AI Generated — ${new Date().toLocaleDateString()}`;
      const now = new Date().toISOString();

      const { data: newSuite, error: suiteError } = await supabase
        .from('test_suites')
        .insert({
          project_id: projectId,
          name: suiteName,
          description: `AI-generated test suite from prompt: "${req.body.prompt.substring(0, 100)}..."`,
          created_at: now,
          updated_at: now,
        })
        .select()
        .single();

      if (suiteError || !newSuite) {
        return next(suiteError ?? new AppError('INTERNAL_ERROR', 500, 'Failed to create suite'));
      }

      suiteId = newSuite.id;
    }

    // 4. Call AI engine
    logger.info({
      event: 'ai:generate:start',
      projectId,
      provider: selectedProvider,
      promptLength: req.body.prompt.length,
    });

    const result = await generateTestCases({
      prompt: req.body.prompt,
      provider: selectedProvider,
      apiKey: rawApiKey,
      baseUrl: project.base_url ?? undefined,
    });

    logger.info({
      event: 'ai:generate:complete',
      projectId,
      provider: selectedProvider,
      casesGenerated: result.test_cases.length,
      durationMs: result.generation_time_ms,
    });

    // 5. Insert generated test cases into DB
    const now = new Date().toISOString();
    const inserts = result.test_cases.map((tc) => ({
      suite_id: suiteId,
      title: tc.title,
      description: tc.description || null,
      steps: tc.steps,
      expected_result: tc.expected_result || null,
      priority: tc.priority || 'medium',
      type: tc.type || 'functional',
      tags: tc.tags || [],
      is_ai_generated: true,
      source: 'ai_generated' as const,
      created_at: now,
      updated_at: now,
    }));

    const { data: insertedCases, error: insertError } = await supabase
      .from('test_cases')
      .insert(inserts)
      .select('id, title, steps');

    if (insertError) {
      return next(new AppError('INTERNAL_ERROR', 500, 'Failed to save generated test cases'));
    }

    res.status(201).json({
      suite_id: suiteId,
      test_cases: insertedCases ?? [],
      provider_used: selectedProvider,
      generation_time_ms: result.generation_time_ms,
    });
  } catch (err) {
    logger.error({
      event: 'ai:generate:error',
      error: err instanceof Error ? err.message : String(err),
    });
    next(err);
  }
});

// ── POST /projects/:projectId/ai/optimize/:caseId ──────────────────────────────

router.post('/optimize/:caseId', async (req, res, next) => {
  try {
    const { projectId, caseId } = req.params as any;

    // 1. Verify project ownership
    const { data: project } = await supabase
      .from('projects')
      .select('id, base_url')
      .eq('id', projectId)
      .eq('user_id', req.user.id)
      .single();

    if (!project) {
      return next(new AppError('NOT_FOUND', 404, 'Project not found'));
    }

    // 2. Fetch the existing test case
    const { data: testCase, error: caseError } = await supabase
      .from('test_cases')
      .select('*')
      .eq('id', caseId)
      .single();

    if (caseError || !testCase) {
      return next(new AppError('NOT_FOUND', 404, 'Test case not found'));
    }

    // 3. Resolve AI provider key
    const { provider: selectedProvider, apiKey: rawApiKey } = await resolveAIKey(req.user.id);

    // 4. Call AI engine to optimize the manual test case
    const result = await optimizeTestCase({
      title: testCase.title,
      description: testCase.description || undefined,
      steps: testCase.steps || [],
      expected_result: testCase.expected_result || undefined,
      provider: selectedProvider,
      apiKey: rawApiKey,
      baseUrl: project.base_url || undefined,
    });

    // 5. Update the test case inside the DB
    const { data: updatedCase, error: updateError } = await supabase
      .from('test_cases')
      .update({
        title: result.test_case.title,
        description: result.test_case.description || null,
        steps: result.test_case.steps,
        expected_result: result.test_case.expected_result || null,
        priority: result.test_case.priority,
        type: result.test_case.type,
        tags: result.test_case.tags,
        is_ai_generated: true, // Marked as AI optimized!
        updated_at: new Date().toISOString(),
      })
      .eq('id', caseId)
      .select()
      .single();

    if (updateError || !updatedCase) {
      return next(new AppError('INTERNAL_ERROR', 500, 'Failed to update optimized test case'));
    }

    res.status(200).json({
      test_case: updatedCase,
      provider_used: selectedProvider,
      optimization_time_ms: result.optimization_time_ms,
    });
  } catch (err) {
    logger.error({
      event: 'ai:optimize:error',
      error: err instanceof Error ? err.message : String(err),
    });
    next(err);
  }
});

export default router;
