import type { Request, Response, NextFunction } from 'express';

// ── AppError ───────────────────────────────────────────────────────────────────

/**
 * Typed application error.  Import this class everywhere — never re-declare.
 *
 * Error code reference:
 *   UNAUTHORIZED   → 401   Missing / invalid / expired token
 *   FORBIDDEN      → 403   Resource exists but belongs to another user
 *   NOT_FOUND      → 404   Resource not found
 *   CONFLICT       → 409   Duplicate resource (e.g. duplicate provider key)
 *   VALIDATION_ERROR → 400 Zod parse failure
 *   RATE_LIMITED   → 429   Rate limit exceeded
 *   INTERNAL_ERROR → 500   Unhandled exception catch-all
 */
export class AppError extends Error {
  constructor(
    public readonly code: string,
    public readonly statusCode: number,
    message: string,
    public readonly details?: unknown,
  ) {
    super(message);
    this.name = 'AppError';
    // Maintains proper prototype chain for instanceof checks in ES5 targets
    Object.setPrototypeOf(this, new.target.prototype);
  }
}

// ── Global error handler ───────────────────────────────────────────────────────

import logger from '../utils/logger.js';
import { env } from '../config/env.js';

export function errorHandler(
  err: Error,
  req: Request,
  res: Response,
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  _next: NextFunction,
): void {
  logger.error({
    message: err.message,
    stack: env.NODE_ENV !== 'production' ? err.stack : undefined,
    path: req.path,
    method: req.method,
  });

  if (err instanceof AppError) {
    res.status(err.statusCode).json({
      error: {
        code: err.code,
        message: err.message,
        details: err.details ?? null,
      },
    });
    return;
  }

  // Unhandled error — never expose message or stack in production
  res.status(500).json({
    error: {
      code: 'INTERNAL_ERROR',
      message:
        env.NODE_ENV === 'production'
          ? 'An unexpected error occurred'
          : err.message,
      details: null,
    },
  });
}
