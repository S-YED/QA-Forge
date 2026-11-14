import type { NextFunction, Request, Response } from 'express';
import { describe, expect, it } from 'vitest';
import { z } from 'zod';
import { validate } from '../middleware/validation.js';

/** Seeded rows use nil-style ids (00000000-...-0001) that zod 4's strict `uuid()` rejects; routes use `z.guid()`. */
const run = (id: string) => {
  const req = { params: { id } } as unknown as Request;
  let error: unknown = 'not called';
  validate(z.object({ id: z.guid() }), 'params')(req, {} as Response, ((e?: unknown) => (error = e)) as NextFunction);
  return error;
};

describe('validate with id params', () => {
  it('accepts seeded and random ids, rejects anything else', () => {
    expect(run('00000000-0000-0000-0000-000000000001')).toBeUndefined();
    expect(run('3f2b8c1e-9d4a-4f6b-8e2a-1c5d7e9f0a3b')).toBeUndefined();
    expect(run('not-an-id')).toMatchObject({ statusCode: 400 });
  });
});
