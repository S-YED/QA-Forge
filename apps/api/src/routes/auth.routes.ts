import { Router, type IRouter } from 'express';
import { z } from 'zod';
import { createClient as createSupabaseClient } from '@supabase/supabase-js';
import { authenticate } from '../middleware/auth.middleware.js';
import { demoAuthLimiter } from '../middleware/rate-limiter.js';
import { validate } from '../middleware/validation.js';
import { AppError } from '../middleware/error-handler.js';
import { supabase } from '../config/supabase.js';
import { env } from '../config/env.js';

const router: IRouter = Router();

// ── POST /api/auth/demo ───────────────────────────────────────────────────────
// Signs in as the demo user server-side and returns session tokens.
// This prevents hardcoded credentials from appearing in the client bundle.

router.post('/demo', demoAuthLimiter, async (_req, res, next) => {
  try {
    // Use anon key client for auth operations (service_role bypasses email confirmation)
    const anonClient = createSupabaseClient(
      env.SUPABASE_URL,
      env.SUPABASE_ANON_KEY,
    );

    const { data, error } = await anonClient.auth.signInWithPassword({
      email: 'demo@qaforge.dev',
      password: 'DemoPassword123!',
    });

    if (error || !data.session) {
      return next(
        new AppError(
          'INTERNAL_ERROR',
          500,
          'Demo account is temporarily unavailable. Please try again later.',
        ),
      );
    }

    res.status(200).json({
      access_token: data.session.access_token,
      refresh_token: data.session.refresh_token,
      expires_in: data.session.expires_in,
      token_type: data.session.token_type,
    });
  } catch (err) {
    next(err);
  }
});

// ── GET /api/auth/me ───────────────────────────────────────────────────────────

router.get('/me', authenticate, async (req, res, next) => {
  try {
    const { data: profile, error } = await supabase
      .from('profiles')
      .select('*')
      .eq('id', req.user.id)
      .single();

    if (error || !profile) {
      // Edge case: auth token is valid but the profile trigger failed on signup
      return next(new AppError('NOT_FOUND', 404, 'Profile not found'));
    }

    res.status(200).json({ profile });
  } catch (err) {
    next(err);
  }
});

// ── PUT /api/auth/me ───────────────────────────────────────────────────────────

const updateProfileSchema = z.object({
  full_name: z.string().min(1).max(100).optional(),
  avatar_url: z.string().url().optional(),
});

router.put(
  '/me',
  authenticate,
  validate(updateProfileSchema),
  async (req, res, next) => {
    try {
      const { data: profile, error } = await supabase
        .from('profiles')
        .update({
          ...req.body,
          updated_at: new Date().toISOString(),
        })
        .eq('id', req.user.id)
        .select()
        .single();

      if (error || !profile) {
        return next(new AppError('NOT_FOUND', 404, 'Profile not found'));
      }

      res.status(200).json({ profile });
    } catch (err) {
      next(err);
    }
  },
);

export default router;
