import express from 'express';
import cors from 'cors';
import type { ApiError } from '@qaforge/shared-types';

const app = express();

// ── Middleware ─────────────────────────────────────────────────────────────────

app.use(express.json());
app.use(
  cors({
    origin: process.env.CORS_ORIGIN || 'http://localhost:3000',
  }),
);

// ── Health Check ──────────────────────────────────────────────────────────────

app.get('/api/health', (_req, res) => {
  res.json({
    status: 'ok',
    timestamp: new Date().toISOString(),
  });
});

// ── 404 Catch-All ─────────────────────────────────────────────────────────────

app.use((_req, res) => {
  const error: ApiError = {
    error: 'Not Found',
    message: 'Route not found',
    statusCode: 404,
  };
  res.status(404).json(error);
});

export default app;
