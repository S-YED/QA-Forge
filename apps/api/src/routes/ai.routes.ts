import { Router, type IRouter } from 'express';
import { z } from 'zod';
import { validate } from '../middleware/validation.js';
import { AppError } from '../middleware/error-handler.js';
import { supabase } from '../config/supabase.js';
import { decrypt } from '../utils/encryption.js';
import { generateTestCases } from '@qaforge/ai-engine';
import logger from '../utils/logger.js';
import type { ApiKeyProvider } from '@qaforge/shared-types';

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

    // 2. Resolve AI provider — use specified or auto-select from valid keys
    let selectedProvider: ApiKeyProvider;
    let rawApiKey: string;

    if (req.body.provider) {
      // User specified a provider — find their key for it
      const { data: keyRow } = await supabase
        .from('api_keys')
        .select('id, provider, encrypted_key, is_valid')
        .eq('user_id', req.user.id)
        .eq('provider', req.body.provider)
        .eq('is_valid', true)
        .single();

      if (!keyRow) {
        return next(
          new AppError(
            'VALIDATION_ERROR',
            400,
            `No valid ${req.body.provider} API key found. Add and validate one in Settings → API Keys.`,
          ),
        );
      }

      selectedProvider = keyRow.provider as ApiKeyProvider;
      rawApiKey = decrypt(keyRow.encrypted_key as string);
    } else {
      // Auto-select: pick the first valid key from preferred order
      const preferredOrder: ApiKeyProvider[] = ['anthropic', 'openai', 'gemini'];
      const { data: validKeys } = await supabase
        .from('api_keys')
        .select('id, provider, encrypted_key')
        .eq('user_id', req.user.id)
        .eq('is_valid', true);

      if (!validKeys || validKeys.length === 0) {
        return next(
          new AppError(
            'VALIDATION_ERROR',
            400,
            'No valid AI provider keys found. Add and validate at least one API key in Settings → API Keys.',
          ),
        );
      }

      const sorted = validKeys.sort((a, b) => {
        return preferredOrder.indexOf(a.provider as ApiKeyProvider) -
          preferredOrder.indexOf(b.provider as ApiKeyProvider);
      });

      selectedProvider = sorted[0].provider as ApiKeyProvider;
      rawApiKey = decrypt(sorted[0].encrypted_key as string);
    }

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

export default router;
