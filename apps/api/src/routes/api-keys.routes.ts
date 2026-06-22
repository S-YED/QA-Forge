import { Router, type IRouter } from 'express';
import { z } from 'zod';
import { validate } from '../middleware/validation.js';
import { AppError } from '../middleware/error-handler.js';
import { supabase } from '../config/supabase.js';
import { encrypt, decrypt } from '../utils/encryption.js';
import logger from '../utils/logger.js';

// All routes in this router are pre-protected by `authenticate` applied in app.ts.
// HARD RULE: Never use SELECT * on api_keys — encrypted_key must be excluded
//            from every query except the /validate endpoint.

const router: IRouter = Router();

const uuidParamsSchema = z.object({ id: z.string().uuid() });

// ── GET / ──────────────────────────────────────────────────────────────────────

router.get('/', async (req, res, next) => {
  try {
    // Explicitly exclude encrypted_key — never use SELECT *
    const { data: keys, error } = await supabase
      .from('api_keys')
      .select('id, user_id, provider, key_hint, is_valid, created_at, updated_at')
      .eq('user_id', req.user.id);

    if (error) return next(error);

    res.status(200).json({ keys });
  } catch (err) {
    next(err);
  }
});

// ── POST / ────────────────────────────────────────────────────────────────────

const createKeySchema = z.object({
  provider: z.enum(['openai', 'anthropic', 'gemini', 'openrouter']),
  key: z.string().min(10),
});

router.post('/', validate(createKeySchema), async (req, res, next) => {
  try {
    // Enforce UNIQUE(user_id, provider) at the application layer with a clear message
    const { data: existing } = await supabase
      .from('api_keys')
      .select('id')
      .eq('user_id', req.user.id)
      .eq('provider', req.body.provider)
      .single();

    if (existing) {
      return next(
        new AppError(
          'CONFLICT',
          409,
          'A key for this provider already exists. Use PUT to update it.',
        ),
      );
    }

    const rawKey: string = req.body.key;
    const encryptedKey = encrypt(rawKey);
    const keyHint = rawKey.slice(-4); // Last 4 characters only — never store full key

    const { data: key, error } = await supabase
      .from('api_keys')
      .insert({
        user_id: req.user.id,
        provider: req.body.provider,
        encrypted_key: encryptedKey,
        key_hint: keyHint,
        is_valid: false, // Validity confirmed only after explicit /validate call
      })
      .select('id, provider, key_hint, is_valid')
      .single();

    if (error || !key) return next(error ?? new AppError('INTERNAL_ERROR', 500, 'Failed to store API key'));

    res.status(201).json({ key });
  } catch (err) {
    next(err);
  }
});

// ── PUT /:id ──────────────────────────────────────────────────────────────────

const updateKeySchema = z.object({
  key: z.string().min(10),
});

router.put(
  '/:id',
  validate(uuidParamsSchema, 'params'),
  validate(updateKeySchema),
  async (req, res, next) => {
    try {
      // Verify ownership before updating
      const { data: existing } = await supabase
        .from('api_keys')
        .select('id')
        .eq('id', req.params.id)
        .eq('user_id', req.user.id)
        .single();

      if (!existing) {
        return next(new AppError('NOT_FOUND', 404, 'API key not found'));
      }

      const rawKey: string = req.body.key;
      const encryptedKey = encrypt(rawKey);
      const keyHint = rawKey.slice(-4);

      const { data: key, error } = await supabase
        .from('api_keys')
        .update({
          encrypted_key: encryptedKey,
          key_hint: keyHint,
          is_valid: false, // Reset to unverified on update; confirmed only after /validate
          updated_at: new Date().toISOString(),
        })
        .eq('id', req.params.id)
        .eq('user_id', req.user.id)
        .select('id, provider, key_hint, is_valid')
        .single();

      if (error || !key) return next(new AppError('NOT_FOUND', 404, 'API key not found'));

      res.status(200).json({ key });
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
        .from('api_keys')
        .delete()
        .eq('id', req.params.id)
        .eq('user_id', req.user.id)
        .select('id')
        .single();

      if (error || !data) {
        return next(new AppError('NOT_FOUND', 404, 'API key not found'));
      }

      res.status(200).json({ success: true });
    } catch (err) {
      next(err);
    }
  },
);

// ── POST /:id/validate ────────────────────────────────────────────────────────

/**
 * Provider health-check reference:
 *   openai    → GET  https://api.openai.com/v1/models                   → HTTP 200
 *   anthropic → POST https://api.anthropic.com/v1/messages              → HTTP 200 or 400
 *   gemini    → GET  https://generativelanguage.googleapis.com/v1beta/models?key=<key> → HTTP 200
 */

router.post(
  '/:id/validate',
  validate(uuidParamsSchema, 'params'),
  async (req, res, next) => {
    try {
      // Fetch including encrypted_key — only time it is selected
      const { data: row, error: fetchError } = await supabase
        .from('api_keys')
        .select('id, user_id, provider, encrypted_key')
        .eq('id', req.params.id)
        .eq('user_id', req.user.id)
        .single();

      if (fetchError || !row) {
        return next(new AppError('NOT_FOUND', 404, 'API key not found'));
      }

      const rawKey = decrypt(row.encrypted_key as string);
      const provider = row.provider as 'openai' | 'anthropic' | 'gemini' | 'openrouter';

      let isValid = false;
      let validationError: string | undefined;

      try {
        const status = await callProviderHealthCheck(provider, rawKey);
        isValid = status;
      } catch (providerErr) {
        logger.warn({
          event: 'api_key:validate:provider_error',
          provider,
          keyId: req.params.id,
          error: providerErr instanceof Error ? providerErr.message : String(providerErr),
        });
        validationError = 'Invalid API key';
      }

      // Persist the validation result
      await supabase
        .from('api_keys')
        .update({ is_valid: isValid, updated_at: new Date().toISOString() })
        .eq('id', req.params.id)
        .eq('user_id', req.user.id);

      const response: { is_valid: boolean; error?: string } = { is_valid: isValid };
      if (!isValid && validationError) response.error = validationError;

      res.status(200).json(response);
    } catch (err) {
      next(err);
    }
  },
);

// ── Provider health-check helpers ─────────────────────────────────────────────

async function callProviderHealthCheck(
  provider: 'openai' | 'anthropic' | 'gemini' | 'openrouter',
  key: string,
): Promise<boolean> {
  switch (provider) {
    case 'openai': {
      const res = await fetch('https://api.openai.com/v1/models', {
        headers: { Authorization: `Bearer ${key}` },
      });
      return res.status === 200;
    }

    case 'openrouter': {
      // OpenRouter exposes an authenticated key-introspection endpoint:
      // 200 = key valid, 401 = invalid. No generation quota consumed.
      const res = await fetch('https://openrouter.ai/api/v1/key', {
        headers: { Authorization: `Bearer ${key}` },
      });
      return res.status === 200;
    }

    case 'anthropic': {
      const res = await fetch('https://api.anthropic.com/v1/messages', {
        method: 'POST',
        headers: {
          'x-api-key': key,
          'anthropic-version': '2023-06-01',
          'content-type': 'application/json',
        },
        body: JSON.stringify({
          model: 'claude-haiku-4-5-20251001',
          max_tokens: 1,
          messages: [{ role: 'user', content: '.' }],
        }),
      });
      // HTTP 200 = success; HTTP 400 = auth passed but minimal payload rejected (acceptable)
      return res.status === 200 || res.status === 400;
    }

    case 'gemini': {
      const res = await fetch(
        `https://generativelanguage.googleapis.com/v1beta/models?key=${encodeURIComponent(key)}`,
      );
      return res.status === 200;
    }

    default: {
      throw new AppError('VALIDATION_ERROR', 400, `Unknown provider: ${provider}`);
    }
  }
}

export default router;
