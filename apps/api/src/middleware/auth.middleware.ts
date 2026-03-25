import type { Request, Response, NextFunction } from 'express';
import { supabase } from '../config/supabase.js';
import { AppError } from './error-handler.js';

/**
 * JWT authentication middleware.
 *
 * Validates the Bearer token via supabase.auth.getUser() (live network call —
 * ensures revoked tokens are rejected). Fetches the user's role from the
 * profiles table and attaches { id, email, role } to req.user.
 *
 * Apply to individual routers in app.ts, not globally, to keep /api/health
 * and 404 responses unauthenticated.
 */
export async function authenticate(
  req: Request,
  _res: Response,
  next: NextFunction,
): Promise<void> {
  try {
    const authHeader = req.headers.authorization;

    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      next(
        new AppError(
          'UNAUTHORIZED',
          401,
          'Missing or malformed Authorization header',
        ),
      );
      return;
    }

    const token = authHeader.slice(7); // Remove 'Bearer '

    // Validate JWT via Supabase Auth (live call — detects revoked tokens)
    const { data, error } = await supabase.auth.getUser(token);

    if (error || !data.user) {
      next(new AppError('UNAUTHORIZED', 401, 'Invalid or expired token'));
      return;
    }

    // Fetch profile row to get the user's role (not included in auth.getUser response)
    const { data: profile, error: profileError } = await supabase
      .from('profiles')
      .select('id, email, role')
      .eq('id', data.user.id)
      .single();

    if (profileError || !profile) {
      next(new AppError('UNAUTHORIZED', 401, 'User profile not found'));
      return;
    }

    req.user = {
      id: profile.id as string,
      email: profile.email as string,
      role: profile.role as string,
    };

    next();
  } catch (err) {
    next(err);
  }
}
