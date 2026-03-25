import rateLimit from 'express-rate-limit';
import { AppError } from './error-handler.js';

// ── Default limiter (all routes) ───────────────────────────────────────────────

export const defaultLimiter = rateLimit({
  windowMs: 60_000,   // 1 minute
  max: 100,
  standardHeaders: true,
  legacyHeaders: false,
  handler: (_req, _res, next) => {
    next(
      new AppError(
        'RATE_LIMITED',
        429,
        'Too many requests — try again in 60 seconds',
      ),
    );
  },
});

// ── AI limiter (AI-heavy routes in MVP-2 / MVP-3) ─────────────────────────────

export const aiLimiter = rateLimit({
  windowMs: 60_000,   // 1 minute
  max: 10,
  standardHeaders: true,
  legacyHeaders: false,
  handler: (_req, _res, next) => {
    next(
      new AppError(
        'RATE_LIMITED',
        429,
        'Too many AI requests — try again in 60 seconds',
      ),
    );
  },
});
