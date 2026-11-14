import { describe, it, expect, vi, beforeEach } from 'vitest';
import type { Request, Response, NextFunction } from 'express';
import { concurrencyLimiter, releaseSlot, getActiveCount } from '../concurrency-limiter.js';

// These tests run without REDIS_URL, so the limiter uses its in-memory
// fallback. The exported functions are async (Redis-backed in production), so
// every call is awaited here.

function createMocks(userId: string) {
  const req = {
    user: { id: userId, email: 'test@test.com', role: 'tester', is_demo: false },
  } as unknown as Request;

  const res = {} as Response;
  const next = vi.fn() as unknown as NextFunction;

  return { req, res, next };
}

describe('concurrencyLimiter', () => {
  beforeEach(async () => {
    // Reset state by releasing all slots
    for (const id of ['user-1', 'user-2', 'user-3']) {
      while ((await getActiveCount(id)) > 0) await releaseSlot(id);
    }
  });

  it('allows the first concurrent request', async () => {
    const { req, res, next } = createMocks('user-1');
    await concurrencyLimiter(req, res, next);
    expect(next).toHaveBeenCalledWith();
    expect(await getActiveCount('user-1')).toBe(1);
  });

  it('allows the second concurrent request', async () => {
    const { req: req1, res: res1, next: next1 } = createMocks('user-1');
    const { req: req2, res: res2, next: next2 } = createMocks('user-1');

    await concurrencyLimiter(req1, res1, next1);
    await concurrencyLimiter(req2, res2, next2);

    expect(next1).toHaveBeenCalledWith();
    expect(next2).toHaveBeenCalledWith();
    expect(await getActiveCount('user-1')).toBe(2);
  });

  it('blocks the third concurrent request with 429', async () => {
    const { req: req1, res: res1, next: next1 } = createMocks('user-1');
    const { req: req2, res: res2, next: next2 } = createMocks('user-1');
    const { req: req3, res: res3, next: next3 } = createMocks('user-1');

    await concurrencyLimiter(req1, res1, next1);
    await concurrencyLimiter(req2, res2, next2);
    await concurrencyLimiter(req3, res3, next3);

    expect(next3).toHaveBeenCalledWith(
      expect.objectContaining({
        statusCode: 429,
        code: 'RATE_LIMITED',
      }),
    );
    expect(await getActiveCount('user-1')).toBe(2); // Still 2, not 3
  });

  it('tracks users independently', async () => {
    const { req: req1, res: res1, next: next1 } = createMocks('user-1');
    const { req: req2, res: res2, next: next2 } = createMocks('user-2');

    await concurrencyLimiter(req1, res1, next1);
    await concurrencyLimiter(req2, res2, next2);

    expect(await getActiveCount('user-1')).toBe(1);
    expect(await getActiveCount('user-2')).toBe(1);
  });

  it('allows requests after slot is released', async () => {
    const { req: req1, res: res1, next: next1 } = createMocks('user-1');
    const { req: req2, res: res2, next: next2 } = createMocks('user-1');

    await concurrencyLimiter(req1, res1, next1);
    await concurrencyLimiter(req2, res2, next2);

    // At max — release one
    await releaseSlot('user-1');
    expect(await getActiveCount('user-1')).toBe(1);

    // Now a third request should succeed
    const { req: req3, res: res3, next: next3 } = createMocks('user-1');
    await concurrencyLimiter(req3, res3, next3);
    expect(next3).toHaveBeenCalledWith();
    expect(await getActiveCount('user-1')).toBe(2);
  });

  it('passes through when user is undefined', async () => {
    const req = {} as unknown as Request;
    const res = {} as Response;
    const next = vi.fn() as unknown as NextFunction;

    await concurrencyLimiter(req, res, next);
    expect(next).toHaveBeenCalledWith();
  });
});

describe('releaseSlot', () => {
  beforeEach(async () => {
    while ((await getActiveCount('user-1')) > 0) await releaseSlot('user-1');
  });

  it('decrements the active count', async () => {
    const { req, res, next } = createMocks('user-1');
    await concurrencyLimiter(req, res, next);
    expect(await getActiveCount('user-1')).toBe(1);

    await releaseSlot('user-1');
    expect(await getActiveCount('user-1')).toBe(0);
  });

  it('does not go below zero', async () => {
    await releaseSlot('user-1');
    expect(await getActiveCount('user-1')).toBe(0);

    await releaseSlot('user-1');
    expect(await getActiveCount('user-1')).toBe(0);
  });
});
