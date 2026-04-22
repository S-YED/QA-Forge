import express, { type Express } from 'express';
import cors from 'cors';
import { env } from './config/env.js';
import { defaultLimiter } from './middleware/rate-limiter.js';
import { errorHandler } from './middleware/error-handler.js';
import { authenticate } from './middleware/auth.middleware.js';
import authRouter from './routes/auth.routes.js';
import projectsRouter from './routes/projects.routes.js';
import apiKeysRouter from './routes/api-keys.routes.js';
import testSuitesRouter from './routes/test-suites.routes.js';
import testCasesRouter from './routes/test-cases.routes.js';
import testRunsRouter from './routes/test-runs.routes.js';
import aiRouter from './routes/ai.routes.js';
import bugsRouter from './routes/bugs.routes.js';

const app: Express = express();

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
app.use('/api/auth', authRouter);

// ── 6. Project routes (all protected) ─────────────────────────────────────────
app.use('/api/projects', authenticate, projectsRouter);

// ── 7. API key routes (all protected) ─────────────────────────────────────────
app.use('/api/api-keys', authenticate, apiKeysRouter);

// ── 8. Test suite routes (all protected, nested under projects) ───────────────
app.use('/api/projects/:projectId/test-suites', authenticate, testSuitesRouter);

// ── 9. Test case routes (all protected, nested under suites) ──────────────────
app.use('/api/projects/:projectId/test-suites/:suiteId/test-cases', authenticate, testCasesRouter);

// ── 10. Test run routes (all protected, nested under projects) ────────────────
app.use('/api/projects/:projectId/test-runs', authenticate, testRunsRouter);

// ── 11. AI generation routes (all protected, nested under projects) ───────────
app.use('/api/projects/:projectId/ai', authenticate, aiRouter);

// ── 12. Bug routes (all protected, nested under projects) ─────────────────────
app.use('/api/projects/:projectId/bugs', authenticate, bugsRouter);

// ── 13. 404 catch-all ─────────────────────────────────────────────────────────
app.use((req, res) => {
  res.status(404).json({
    error: {
      code: 'NOT_FOUND',
      message: `Route ${req.method} ${req.path} not found`,
      details: null,
    },
  });
});

// ── 14. Global error handler (must be last) ───────────────────────────────────
app.use(errorHandler);

export default app;
