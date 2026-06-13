import { Redis } from 'ioredis';
import { env } from './env.js';
import logger from '../utils/logger.js';

/**
 * Redis wiring for multi-instance correctness.
 *
 * QA Forge keeps three pieces of cross-request state that break when more than
 * one API instance runs (e.g. Railway with >1 replica):
 *   • per-user concurrent-run counts  (concurrency-limiter)
 *   • rate-limit windows              (express-rate-limit)
 *   • socket.io rooms                 (live test streaming)
 *
 * When REDIS_URL is set, all three are backed by Redis so they are shared
 * across instances. When it is NOT set (local dev, tests), every consumer
 * falls back to in-memory behaviour — so nothing here is required to run the
 * app on a single box.
 *
 * Clients connect in the background, so importing this module never blocks
 * startup; commands issued during a blip reject quickly and callers fall back.
 */

let mainClient: Redis | null = null;
let pubClient: Redis | null = null;
let subClient: Redis | null = null;
let initialized = false;

function makeClient(role: string): Redis {
  // env.REDIS_URL is guaranteed defined by callers (guarded by isRedisEnabled).
  const client = new Redis(env.REDIS_URL as string, {
    maxRetriesPerRequest: 2,
    enableReadyCheck: true,
  });
  client.on('error', (err: Error) => {
    logger.error({ event: 'redis:error', role, error: err.message });
  });
  client.on('connect', () => {
    logger.info({ event: 'redis:connect', role });
  });
  return client;
}

function init(): void {
  if (initialized) return;
  initialized = true;
  if (!env.REDIS_URL) {
    logger.info({ event: 'redis:disabled', detail: 'REDIS_URL not set — using in-memory fallbacks' });
    return;
  }
  mainClient = makeClient('main');
  pubClient = makeClient('pub');
  subClient = pubClient.duplicate();
  subClient.on('error', (err: Error) => {
    logger.error({ event: 'redis:error', role: 'sub', error: err.message });
  });
}

/** True when REDIS_URL is configured (multi-instance mode). */
export function isRedisEnabled(): boolean {
  return Boolean(env.REDIS_URL);
}

/** Shared command client, or null when Redis is not configured. */
export function getRedis(): Redis | null {
  if (!initialized) init();
  return mainClient;
}

/**
 * Pub/sub client pair for the socket.io Redis adapter, or null when Redis is
 * not configured. The two clients are distinct connections (a subscriber
 * connection cannot issue normal commands), as required by the adapter.
 */
export function getRedisPubSub(): { pubClient: Redis; subClient: Redis } | null {
  if (!initialized) init();
  if (!pubClient || !subClient) return null;
  return { pubClient, subClient };
}

/** Back-compat no-op retained for any callers of the old stub. */
export async function connectRedis(): Promise<void> {
  init();
}
