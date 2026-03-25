import type { Request, Response, NextFunction } from 'express';
import type { ZodSchema } from 'zod';
import { AppError } from './error-handler.js';

type ValidationTarget = 'body' | 'query' | 'params';

/**
 * Zod validation middleware factory.
 *
 * Usage:
 *   router.post('/', validate(MySchema), handler)
 *   router.get('/:id', validate(ParamsSchema, 'params'), handler)
 *
 * On success  → req[target] is replaced with the parsed, coerced value.
 * On failure  → calls next(AppError('VALIDATION_ERROR', 400, ...)) with formatted details.
 */
export function validate(schema: ZodSchema, target: ValidationTarget = 'body') {
  return (req: Request, _res: Response, next: NextFunction): void => {
    const result = schema.safeParse(req[target]);

    if (!result.success) {
      next(
        new AppError(
          'VALIDATION_ERROR',
          400,
          'Validation failed',
          result.error.format(),
        ),
      );
      return;
    }

    // Replace raw input with the parsed, typed, coerced value
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    (req as any)[target] = result.data;
    next();
  };
}
