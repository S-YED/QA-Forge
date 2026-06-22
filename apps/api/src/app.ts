import express, { type Express } from 'express';
import cors from 'cors';
import helmet from 'helmet';
import { env } from './config/env.js';
import { defaultLimiter, aiLimiter } from './middleware/rate-limiter.js';
import { errorHandler } from './middleware/error-handler.js';
import { authenticate } from './middleware/auth.middleware.js';
import { demoGuard } from './middleware/demo-guard.js';
import authRouter from './routes/auth.routes.js';
import projectsRouter from './routes/projects.routes.js';
import apiKeysRouter from './routes/api-keys.routes.js';
import testSuitesRouter from './routes/test-suites.routes.js';
import testCasesRouter from './routes/test-cases.routes.js';
import testRunsRouter from './routes/test-runs.routes.js';
import aiRouter from './routes/ai.routes.js';
import bugsRouter from './routes/bugs.routes.js';
import recordedSessionsRouter from './routes/recorded-sessions.routes.js';

const app: Express = express();

// ── 0. Security headers (helmet) ───────────────────────────────────────────────
// The API serves JSON only and is consumed cross-origin by the web app, so the
// HTML-oriented CSP is disabled and Cross-Origin-Resource-Policy is relaxed to
// 'cross-origin'. All other protective headers (X-Content-Type-Options,
// X-Frame-Options, Strict-Transport-Security, Referrer-Policy, etc.) keep their
// secure defaults.
app.use(
  helmet({
    contentSecurityPolicy: false,
    crossOriginResourcePolicy: { policy: 'cross-origin' },
  }),
);

// ── 1. Body parser ─────────────────────────────────────────────────────────────
// 10MB limit for context uploads in post-MVP AI routes
app.use(express.json({ limit: '10mb' }));

// ── 2. CORS ────────────────────────────────────────────────────────────────────
app.use(
  cors({
    origin: (origin, cb) => {
      // Allow requests with no origin (e.g. server-to-server, curl)
      if (!origin || env.CORS_ORIGINS.includes(origin)) {
        cb(null, true);
      } else {
        cb(new Error('Not allowed by CORS'));
      }
    },
    credentials: true,
  }),
);

// ── 3. Rate limiter — applied globally ────────────────────────────────────────
app.use(defaultLimiter);

// ── 4. Health check (unauthenticated) ─────────────────────────────────────────
app.get('/api/health', (_req, res) => {
  res.json({
    status: 'ok',
    timestamp: new Date().toISOString(),
    version: '2.0.0-mvp',
  });
});

// ── 5. Auth routes ─────────────────────────────────────────────────────────────
// authenticate is applied per-route inside the router (GET/PUT /me)
// POST /demo is unauthenticated (it creates the session)
app.use('/api/auth', authRouter);

// ── 6. Project routes (all protected, demo-guarded) ───────────────────────────
app.use('/api/projects', authenticate, demoGuard, projectsRouter);

// ── 7. API key routes (all protected, demo-guarded) ───────────────────────────
app.use('/api/api-keys', authenticate, demoGuard, apiKeysRouter);

// ── 8. Test suite routes (all protected, demo-guarded) ────────────────────────
app.use('/api/projects/:projectId/test-suites', authenticate, demoGuard, testSuitesRouter);

// ── 9. Test case routes (all protected, demo-guarded) ─────────────────────────
app.use('/api/projects/:projectId/test-suites/:suiteId/test-cases', authenticate, demoGuard, testCasesRouter);

// ── 10. Test run routes (all protected, demo-guarded) ─────────────────────────
app.use('/api/projects/:projectId/test-runs', authenticate, demoGuard, testRunsRouter);

// ── 11. AI generation routes (all protected, demo-guarded, AI rate-limited) ───
// aiLimiter (10/min) caps the expensive AI-generation endpoints per user.
app.use('/api/projects/:projectId/ai', authenticate, demoGuard, aiLimiter, aiRouter);

// ── 12. Bug routes (all protected, demo-guarded) ──────────────────────────────
app.use('/api/projects/:projectId/bugs', authenticate, demoGuard, bugsRouter);

// ── 13. Recorded session routes (all protected, demo-guarded) ──────────────────
app.use('/api/projects/:projectId/recorded-sessions', authenticate, demoGuard, recordedSessionsRouter);

// ── 14. 404 catch-all ─────────────────────────────────────────────────────────
app.use((req, res) => {
  res.status(404).json({
    error: {
      code: 'NOT_FOUND',
      message: `Route ${req.method} ${req.path} not found`,
      details: null,
    },
  });
});

// ── 15. Global error handler (must be last) ───────────────────────────────────
app.use(errorHandler);

export default app;

