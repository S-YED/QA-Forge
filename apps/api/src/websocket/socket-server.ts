import { Server } from 'socket.io';
import http from 'node:http';
import { supabase } from '../config/supabase.js';
import { env } from '../config/env.js';
import logger from '../utils/logger.js';

/**
 * Attach a Socket.io server to an existing HTTP server.
 *
 * This is a scaffold only — event handler logic is added in:
 *   MVP-2: test execution handlers  (websocket/handlers/test.handler.ts)
 *   MVP-3: recording handlers       (websocket/handlers/recording.handler.ts)
 *
 * Authentication is enforced via io.use() before any event handler runs.
 */
export function createSocketServer(httpServer: http.Server): Server {
  const io = new Server(httpServer, {
    cors: {
      origin: env.CORS_ORIGINS,
      credentials: true,
    },
    transports: ['websocket', 'polling'],
  });

  // ── Auth middleware ─────────────────────────────────────────────────────────

  io.use(async (socket, next) => {
    try {
      const token =
        (socket.handshake.auth.token as string | undefined) ??
        socket.handshake.headers.authorization?.replace('Bearer ', '');

      if (!token) {
        return next(new Error('UNAUTHORIZED'));
      }

      const { data, error } = await supabase.auth.getUser(token);

      if (error || !data.user) {
        return next(new Error('UNAUTHORIZED'));
      }

      socket.data.userId = data.user.id;
      socket.data.email = data.user.email;

      next();
    } catch {
      next(new Error('UNAUTHORIZED'));
    }
  });

  // ── Connection handler ──────────────────────────────────────────────────────

  io.on('connection', (socket) => {
    logger.info({
      event: 'socket:connected',
      socketId: socket.id,
      userId: socket.data.userId,
    });

    // ── MVP-2 stub: test execution ────────────────────────────────────────────
    socket.on('test:start', (payload) => {
      logger.debug({ event: 'test:start', payload });
      // TODO: MVP-2 — dispatch to test execution job queue
    });

    // ── MVP-3 stub: browser recording ─────────────────────────────────────────
    socket.on('recording:start', (payload) => {
      logger.debug({ event: 'recording:start', payload });
      // TODO: MVP-3 — dispatch to recording session handler
    });

    // ── Disconnect ────────────────────────────────────────────────────────────
    socket.on('disconnect', (reason) => {
      logger.info({
        event: 'socket:disconnected',
        socketId: socket.id,
        reason,
      });
    });
  });

  return io;
}
