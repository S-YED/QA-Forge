/**
 * TODO: post-MVP — replace with Upstash Redis + BullMQ
 *
 * In MVP-1C Redis is intentionally a no-op stub. The BullMQ job queues
 * for test execution and AI generation are introduced in MVP-2+.
 * No `ioredis` or `@upstash/redis` dependency is added here.
 */

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export const redisClient = null as unknown as never;

export async function connectRedis(): Promise<void> {
  console.log(
    '[redis] Redis connection skipped — BullMQ enabled in post-MVP',
  );
}
