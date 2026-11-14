// dotenv/config MUST be the very first import — before any local module is evaluated.
// If any local module (e.g. config/env.ts) runs before dotenv, process.env will be
// empty and Zod validation will fail even in a correctly configured environment.
import 'dotenv/config';

import http from 'node:http';
import app from './app.js';
import { createSocketServer } from './websocket/socket-server.js';
import { env } from './config/env.js';
import logger from './utils/logger.js';
import { reapInterruptedRuns, shutdownRuns } from './services/run-executor.js';

const server = http.createServer(app);

// EXE-2: runs left pending/running by a previous process can never finish; mark them before serving.
try {
  const reaped = await reapInterruptedRuns();
  if (reaped) logger.warn({ event: 'run:reaped_on_boot', count: reaped });
} catch (err) {
  logger.error({ event: 'run:reap_failed', error: err instanceof Error ? err.message : String(err) });
}

server.listen(env.PORT, () => {
  logger.info(`🚀 QAForge API running on http://localhost:${env.PORT}`);
});

// Attach Socket.io after the HTTP server starts listening
const io = createSocketServer(server);
app.set('io', io);
logger.info('🔌 Socket.io server attached');

// EXE-2: on deploy/stop, cancel in-flight runs so they end as `error` instead of staying `running`.
const shutdown = async (signal: string) => {
  logger.info({ event: 'api:shutdown', signal });
  io.close(); // also stops the HTTP server accepting new connections
  await shutdownRuns();
  process.exit(0);
};
process.once('SIGTERM', () => void shutdown('SIGTERM'));
process.once('SIGINT', () => void shutdown('SIGINT'));

export { io };
