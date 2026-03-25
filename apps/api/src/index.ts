// dotenv/config MUST be the very first import — before any local module is evaluated.
// If any local module (e.g. config/env.ts) runs before dotenv, process.env will be
// empty and Zod validation will fail even in a correctly configured environment.
import 'dotenv/config';

import http from 'node:http';
import app from './app.js';
import { createSocketServer } from './websocket/socket-server.js';
import { env } from './config/env.js';
import logger from './utils/logger.js';

const server = http.createServer(app);

server.listen(env.PORT, () => {
  logger.info(`🚀 QAForge API running on http://localhost:${env.PORT}`);
});

// Attach Socket.io after the HTTP server starts listening
const io = createSocketServer(server);
logger.info('🔌 Socket.io server attached');

export { io };
