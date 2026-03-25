import { Router, type IRouter } from 'express';
import { z } from 'zod';
import { authenticate } from '../middleware/auth.middleware.js';
import { validate } from '../middleware/validation.js';
import { AppError } from '../middleware/error-handler.js';
import { supabase } from '../config/supabase.js';

const router: IRouter = Router();

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
