import type { Request, Response, NextFunction } from 'express';
import { supabase } from '../config/supabase.js';
import { AppError } from './error-handler.js';

// ── Demo user profile cache ─────────────────────────────────────────────────
// In-memory cache for the demo user's profile to avoid a DB roundtrip on
// every request. Non-demo users always hit the DB.

interface CachedProfile {
  id: string;
  email: string;
  role: string;
  is_demo: boolean;
  cachedAt: number;
}

const DEMO_CACHE_TTL_MS = 5 * 60 * 1000; // 5 minutes
let demoProfileCache: CachedProfile | null = null;

function getCachedDemoProfile(userId: string): CachedProfile | null {
  if (
    demoProfileCache &&
    demoProfileCache.id === userId &&
    Date.now() - demoProfileCache.cachedAt < DEMO_CACHE_TTL_MS
  ) {
    return demoProfileCache;
  }
  return null;
}

/**
 * JWT authentication middleware.
 *
 * Validates the Bearer token via supabase.auth.getUser() (live network call —
 * ensures revoked tokens are rejected). Fetches the user's role from the
 * profiles table and attaches { id, email, role, is_demo } to req.user.
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

    // Check demo profile cache first
    const cached = getCachedDemoProfile(data.user.id);
    if (cached) {
      req.user = {
        id: cached.id,
        email: cached.email,
        role: cached.role,
        is_demo: cached.is_demo,
      };
      next();
      return;
    }

    // Fetch profile row to get the user's role (not included in auth.getUser response)
    const { data: profile, error: profileError } = await supabase
      .from('profiles')
      .select('id, email, role, is_demo')
      .eq('id', data.user.id)
      .single();

    if (profileError || !profile) {
      next(new AppError('UNAUTHORIZED', 401, 'User profile not found'));
      return;
    }

    const userProfile = {
      id: profile.id as string,
      email: profile.email as string,
      role: profile.role as string,
      is_demo: (profile.is_demo as boolean) || false,
    };

    req.user = userProfile;

    // Cache if this is the demo user
    if (userProfile.is_demo) {
      demoProfileCache = {
        ...userProfile,
        cachedAt: Date.now(),
      };
    }

    next();
  } catch (err) {
    next(err);
  }
}

