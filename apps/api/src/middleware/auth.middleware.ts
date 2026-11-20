import type { Request, Response, NextFunction } from 'express';
import { supabase } from '../config/supabase.js';
import { AppError } from './error-handler.js';

// ── Profile cache (PERF-1) ──────────────────────────────────────────────────
// Every signed-in request used to make two round trips to Supabase (Sydney) before its own queries: the token check
// and the profile read. The token is now checked here against the project's published signing keys, and a profile is
// kept for a minute. The price, accepted by the owner on 20 Nov: a signed-out token keeps working until it expires
// (at most an hour), and a role change takes up to a minute. A deleted account is forgotten at once (forgetProfile).

interface CachedProfile {
  id: string;
  email: string;
  role: string;
  is_demo: boolean;
  cachedAt: number;
}

const PROFILE_TTL_MS = 60 * 1000;
// ponytail: one process, one map. Several API instances would each keep their own (forgetProfile reaches only this one).
const profiles = new Map<string, CachedProfile>();

function cachedProfile(userId: string): CachedProfile | null {
  const hit = profiles.get(userId);
  return hit && Date.now() - hit.cachedAt < PROFILE_TTL_MS ? hit : null;
}

/** Drops a user's cached profile, so a deleted account's token is refused on its next request. */
export function forgetProfile(userId: string): void {
  profiles.delete(userId);
}

/**
 * JWT authentication middleware.
 *
 * Validates the Bearer token with supabase.auth.getClaims(): its signature and expiry are checked against the project's
 * published signing keys (asymmetric, e.g. ES256), with no call to Supabase Auth. Reads the user's role from the
 * profiles table (kept for a minute) and attaches { id, email, role, is_demo } to req.user.
 *
 * Apply to individual routers in app.ts, not globally, to keep /api/health
 * and 404 responses unauthenticated.
 */
export async function authenticate(
  req: Request,
  _res: Response,
  next: NextFunction,
): Promise<void> {
  // A request to /api/projects/:id/... passes the /api/projects mount first and is already checked there;
  // checking again cost one more Supabase Auth round trip and profile read per mount (CR-2).
  if (req.user) {
    next();
    return;
  }
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

    const { data, error } = await supabase.auth.getClaims(token);
    const userId = data?.claims.sub; // none for the anon or service key

    if (error || !userId) {
      next(new AppError('UNAUTHORIZED', 401, 'Invalid or expired token'));
      return;
    }

    const cached = cachedProfile(userId);
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

    // The profile also stands in for "does this account still exist".
    const { data: profile, error: profileError } = await supabase
      .from('profiles')
      .select('id, email, role, is_demo')
      .eq('id', userId)
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
    if (profiles.size >= 10_000) profiles.clear(); // ponytail: a crude bound; an LRU if it is ever reached
    profiles.set(userId, { ...userProfile, cachedAt: Date.now() });

    next();
  } catch (err) {
    next(err);
  }
}

