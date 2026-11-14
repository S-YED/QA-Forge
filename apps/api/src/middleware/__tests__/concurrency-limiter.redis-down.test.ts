import { describe, expect, it, vi } from 'vitest';

// Redis configured but unreachable: the limiter must fail closed (EXE-2), not grant a slot.
vi.mock('../../config/redis.js', () => ({
  getRedis: () => ({ eval: vi.fn().mockRejectedValue(new Error('ECONNREFUSED')) }),
}));

const { acquireSlot } = await import('../concurrency-limiter.js');

describe('acquireSlot with Redis down', () => {
  it('throws instead of granting a slot', async () => {
    await expect(acquireSlot('user-1')).rejects.toThrow(/Run capacity check unavailable/);
  });
});
