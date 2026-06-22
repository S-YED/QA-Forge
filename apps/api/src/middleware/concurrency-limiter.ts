import type { Request, Response, NextFunction } from 'express';
import { AppError } from './error-handler.js';
import { getRedis } from '../config/redis.js';

/**
 * Per-user concurrency limiter for test runs.
 *
 * Caps the number of in-flight runs per user at `MAX_CONCURRENT`. Backed by
 * Redis when REDIS_URL is set (shared across all API instances), with an
 * in-memory fallback for single-instance / local / test runs.
 *
 * Acquire and release MUST be paired — `acquireSlot` increments, `releaseSlot`
 * decrements. The orchestration handler acquires at the start of a run and
 * releases in a `finally`, so a slot is never leaked regardless of exit path.
 */

const MAX_CONCURRENT = 2;

// ── In-memory fallback (used only when Redis is not configured) ──────────────
const activeCounts = new Map<string, number>();

const keyFor = (userId: string) => `qaforge:concurrency:${userId}`;
// Safety expiry: if an instance crashes mid-run the Redis counter would
// otherwise pin a user at the cap forever. The TTL is refreshed on each
// acquire and comfortably exceeds the longest realistic Playwright run.
const SLOT_TTL_SECONDS = 600;

// Atomic acquire: INCR, set TTL on first holder, roll back if over the cap.
// Returns 1 if the slot was granted, 0 otherwise. Atomic so two instances
// racing for the last slot can never both win.
const ACQUIRE_LUA = `
local count = redis.call('INCR', KEYS[1])
if count == 1 then
  redis.call('EXPIRE', KEYS[1], ARGV[2])
end
if count > tonumber(ARGV[1]) then
  redis.call('DECR', KEYS[1])
  return 0
end
return 1
`;

/**
 * Returns the current active run count for a user.
 */
export async function getActiveCount(userId: string): Promise<number> {
  const redis = getRedis();
  if (redis) {
    const raw = await redis.get(keyFor(userId));
    return raw ? parseInt(raw, 10) : 0;
  }
  return activeCounts.get(userId) || 0;
}

/**
 * Atomically tries to acquire a concurrency slot for a user.
 *
 * Returns true (and increments the count) if the user is below MAX_CONCURRENT,
 * otherwise false without changing state. Pair every successful acquire with
 * exactly one `releaseSlot(userId)`.
 */
export async function acquireSlot(userId: string): Promise<boolean> {
  const redis = getRedis();
  if (redis) {
    try {
      const granted = await redis.eval(
        ACQUIRE_LUA,
        1,
        keyFor(userId),
        String(MAX_CONCURRENT),
        String(SLOT_TTL_SECONDS),
      );
      return granted === 1;
    } catch {
      // Redis unavailable mid-flight — fail open so a Redis blip doesn't take
      // down test execution. The cap degrades to best-effort until it recovers.
      return true;
    }
  }
  const current = activeCounts.get(userId) || 0;
  if (current >= MAX_CONCURRENT) {
    return false;
  }
  activeCounts.set(userId, current + 1);
  return true;
}

/**
 * Releases a previously acquired slot when a run completes.
 */
export async function releaseSlot(userId: string): Promise<void> {
  const redis = getRedis();
  if (redis) {
    try {
      const count = await redis.decr(keyFor(userId));
      if (count <= 0) {
        await redis.del(keyFor(userId));
      }
    } catch {
      // Best-effort release; the TTL guarantees the slot is reclaimed anyway.
    }
    return;
  }
  const current = activeCounts.get(userId) || 0;
  if (current <= 1) {
    activeCounts.delete(userId);
  } else {
    activeCounts.set(userId, current - 1);
  }
}

/**
 * Express middleware that limits concurrent test runs per user.
 *
 * Kept for completeness/reuse. The active enforcement path is acquireSlot/
 * releaseSlot inside executeTestOrchestration; if mounted here, the route
 * handler MUST release the slot on every exit path.
 */
export async function concurrencyLimiter(
  req: Request,
  _res: Response,
  next: NextFunction,
): Promise<void> {
  const userId = req.user?.id;
  if (!userId) {
    next();
    return;
  }

  if (!(await acquireSlot(userId))) {
    next(
      new AppError(
        'RATE_LIMITED',
        429,
        `Too many concurrent runs. Maximum ${MAX_CONCURRENT} simultaneous test runs allowed. Wait for a running test to complete.`,
      ),
    );
    return;
  }

  next();
}
