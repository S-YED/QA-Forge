import { describe, it, expect, vi, beforeEach } from 'vitest';
import type { Request, Response, NextFunction } from 'express';
import { demoGuard } from '../demo-guard.js';

// Helper to create mock request/response/next
function createMocks(overrides: {
  method?: string;
  user?: { id: string; email: string; role: string; is_demo: boolean };
}) {
  const req = {
    method: overrides.method || 'GET',
    user: overrides.user || { id: '1', email: 'test@test.com', role: 'tester', is_demo: false },
  } as unknown as Request;

  const res = {} as Response;

  const next = vi.fn() as unknown as NextFunction;

  return { req, res, next };
}

describe('demoGuard', () => {
  it('allows GET requests for demo users', () => {
    const { req, res, next } = createMocks({
      method: 'GET',
      user: { id: '99', email: 'demo@qaforge.dev', role: 'tester', is_demo: true },
    });

    demoGuard(req, res, next);
    expect(next).toHaveBeenCalledWith();
  });

  it('allows HEAD requests for demo users', () => {
    const { req, res, next } = createMocks({
      method: 'HEAD',
      user: { id: '99', email: 'demo@qaforge.dev', role: 'tester', is_demo: true },
    });

    demoGuard(req, res, next);
    expect(next).toHaveBeenCalledWith();
  });

  it('allows OPTIONS requests for demo users', () => {
    const { req, res, next } = createMocks({
      method: 'OPTIONS',
      user: { id: '99', email: 'demo@qaforge.dev', role: 'tester', is_demo: true },
    });

    demoGuard(req, res, next);
    expect(next).toHaveBeenCalledWith();
  });

  it('blocks POST requests for demo users with 403', () => {
    const { req, res, next } = createMocks({
      method: 'POST',
      user: { id: '99', email: 'demo@qaforge.dev', role: 'tester', is_demo: true },
    });

    demoGuard(req, res, next);
    expect(next).toHaveBeenCalledWith(
      expect.objectContaining({
        statusCode: 403,
        code: 'FORBIDDEN',
      }),
    );
  });

  it('blocks PUT requests for demo users with 403', () => {
    const { req, res, next } = createMocks({
      method: 'PUT',
      user: { id: '99', email: 'demo@qaforge.dev', role: 'tester', is_demo: true },
    });

    demoGuard(req, res, next);
    expect(next).toHaveBeenCalledWith(
      expect.objectContaining({
        statusCode: 403,
        code: 'FORBIDDEN',
      }),
    );
  });

  it('blocks DELETE requests for demo users with 403', () => {
    const { req, res, next } = createMocks({
      method: 'DELETE',
      user: { id: '99', email: 'demo@qaforge.dev', role: 'tester', is_demo: true },
    });

    demoGuard(req, res, next);
    expect(next).toHaveBeenCalledWith(
      expect.objectContaining({
        statusCode: 403,
        code: 'FORBIDDEN',
      }),
    );
  });

  it('blocks PATCH requests for demo users with 403', () => {
    const { req, res, next } = createMocks({
      method: 'PATCH',
      user: { id: '99', email: 'demo@qaforge.dev', role: 'tester', is_demo: true },
    });

    demoGuard(req, res, next);
    expect(next).toHaveBeenCalledWith(
      expect.objectContaining({
        statusCode: 403,
        code: 'FORBIDDEN',
      }),
    );
  });

  it('allows POST requests for non-demo users', () => {
    const { req, res, next } = createMocks({
      method: 'POST',
      user: { id: '1', email: 'alice@qaforge.dev', role: 'admin', is_demo: false },
    });

    demoGuard(req, res, next);
    expect(next).toHaveBeenCalledWith();
  });

  it('allows DELETE requests for non-demo users', () => {
    const { req, res, next } = createMocks({
      method: 'DELETE',
      user: { id: '1', email: 'alice@qaforge.dev', role: 'admin', is_demo: false },
    });

    demoGuard(req, res, next);
    expect(next).toHaveBeenCalledWith();
  });

  it('allows requests when user is undefined', () => {
    const req = { method: 'POST' } as unknown as Request;
    const res = {} as Response;
    const next = vi.fn() as unknown as NextFunction;

    demoGuard(req, res, next);
    expect(next).toHaveBeenCalledWith();
  });

  it('includes user-friendly message in 403 error', () => {
    const { req, res, next } = createMocks({
      method: 'POST',
      user: { id: '99', email: 'demo@qaforge.dev', role: 'tester', is_demo: true },
    });

    demoGuard(req, res, next);
    const error = (next as ReturnType<typeof vi.fn>).mock.calls[0][0];
    expect(error.message).toContain('Demo mode is read-only');
    expect(error.message).toContain('Sign up');
  });
});
