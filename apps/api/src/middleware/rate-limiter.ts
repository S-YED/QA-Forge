import rateLimit, { type Store } from 'express-rate-limit';
import { RedisStore } from 'rate-limit-redis';
import { AppError } from './error-handler.js';
import { getRedis } from '../config/redis.js';

// ── Store factory ────────────────────────────────────────────────────────────
// When REDIS_URL is set, rate-limit windows live in Redis so they are shared
// across API instances (otherwise "100/min" becomes "100/min per replica").
// When Redis is absent, returning undefined makes express-rate-limit use its
// default in-memory store — correct for single-instance / local / tests.
function makeStore(prefix: string): Store | undefined {
  const client = getRedis();
  if (!client) return undefined;
  return new RedisStore({
    // ioredis: forward raw commands. Cast keeps the variadic types happy.
    sendCommand: (...args: string[]) =>
      client.call(...(args as [string, ...string[]])) as Promise<never>,
    prefix,
  });
}

// ── Default limiter (all routes) ───────────────────────────────────────────────

export const defaultLimiter = rateLimit({
  windowMs: 60_000,   // 1 minute
  max: 100,
  standardHeaders: true,
  legacyHeaders: false,
  store: makeStore('rl:default:'),
  handler: (_req, _res, next) => {
    next(
      new AppError(
        'RATE_LIMITED',
        429,
        'Too many requests — try again in 60 seconds',
      ),
    );
  },
});

// ── AI limiter (AI-heavy routes in MVP-2 / MVP-3) ─────────────────────────────

export const aiLimiter = rateLimit({
  windowMs: 60_000,   // 1 minute
  max: 10,
  standardHeaders: true,
  legacyHeaders: false,
  store: makeStore('rl:ai:'),
  handler: (_req, _res, next) => {
    next(
      new AppError(
        'RATE_LIMITED',
        429,
        'Too many AI requests — try again in 60 seconds',
      ),
    );
  },
});

// ── Demo auth limiter — throttle public demo-session minting by IP ────────────
// POST /api/auth/demo is unauthenticated (it creates the session), so it is
// keyed by IP. Stops a bot from looping demo logins / hammering Supabase Auth.

export const demoAuthLimiter = rateLimit({
  windowMs: 60_000,   // 1 minute
  max: 10,
  standardHeaders: true,
  legacyHeaders: false,
  store: makeStore('rl:demo-auth:'),
  handler: (_req, _res, next) => {
    next(
      new AppError(
        'RATE_LIMITED',
        429,
        'Too many demo sign-in attempts — try again in a minute.',
      ),
    );
  },
});

// ── Demo user run limiter (5 runs per hour, keyed by user ID) ──────────────

export const demoRunLimiter = rateLimit({
  windowMs: 60 * 60 * 1000,   // 1 hour
  max: 5,
  standardHeaders: true,
  legacyHeaders: false,
  store: makeStore('rl:demo-run:'),
  keyGenerator: (req) => req.user?.id || req.ip || 'unknown',
  skip: (req) => !req.user?.is_demo,  // Only applies to demo users
  handler: (_req, _res, next) => {
    next(
      new AppError(
        'RATE_LIMITED',
        429,
        'Demo mode allows 5 test runs per hour. Sign up for unlimited runs.',
      ),
    );
  },
});
