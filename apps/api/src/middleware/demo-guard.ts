import type { Request, Response, NextFunction } from 'express';
import { AppError } from './error-handler.js';

/**
 * Demo guard middleware.
 *
 * Blocks mutating requests (POST, PUT, PATCH, DELETE) for demo users.
 * Returns a 403 with a user-friendly message explaining demo mode restrictions.
 *
 * Apply AFTER `authenticate` middleware so that `req.user.is_demo` is available.
 */
export function demoGuard(
  req: Request,
  _res: Response,
  next: NextFunction,
): void {
  // Only restrict demo users
  if (!req.user?.is_demo) {
    next();
    return;
  }

  // Allow read-only methods
  const readOnlyMethods = ['GET', 'HEAD', 'OPTIONS'];
  if (readOnlyMethods.includes(req.method)) {
    next();
    return;
  }

  // Block mutating requests for demo users
  next(
    new AppError(
      'FORBIDDEN',
      403,
      'Demo mode is read-only. Sign up for a free account to create and modify data.',
    ),
  );
}
