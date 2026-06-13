import { Server } from 'socket.io';
import { createAdapter } from '@socket.io/redis-adapter';
import http from 'node:http';
import { supabase } from '../config/supabase.js';
import { env } from '../config/env.js';
import logger from '../utils/logger.js';
import { getRedisPubSub } from '../config/redis.js';
import { registerTestHandlers } from './handlers/test.handler.js';
import { registerRecordingHandlers } from './handlers/recording.handler.js';

/**
 * Attach a Socket.io server to an existing HTTP server.
 *
 * Authentication is enforced via io.use() before any event handler runs.
 *
 * MVP-2: test execution handlers  (websocket/handlers/test.handler.ts)
 * MVP-3: recording handlers       (websocket/handlers/recording.handler.ts)
 */
export function createSocketServer(httpServer: http.Server): Server {
  const io = new Server(httpServer, {
    cors: {
      origin: env.CORS_ORIGINS,
      credentials: true,
    },
    transports: ['websocket', 'polling'],
  });

  // ── Multi-instance fan-out ──────────────────────────────────────────────────
  // With >1 API instance, a client may be connected to instance A while the
  // run that emits its events executes on instance B. The Redis adapter
  // broadcasts room emits across instances so `io.to(room).emit(...)` reaches
  // the client regardless of which instance it landed on. No-op without Redis.
  const pubsub = getRedisPubSub();
  if (pubsub) {
    io.adapter(createAdapter(pubsub.pubClient, pubsub.subClient));
    logger.info({ event: 'socket:redis_adapter_enabled' });
  }

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

    // ── MVP-2: test execution handlers ────────────────────────────────────
    registerTestHandlers(io, socket);

    // ── MVP-3: browser recording handlers ─────────────────────────────────
    registerRecordingHandlers(io, socket);

    // ── Disconnect ────────────────────────────────────────────────────────
    // Socket.io automatically removes the socket from all rooms on disconnect,
    // so no explicit socket.leave() calls are needed here.
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
