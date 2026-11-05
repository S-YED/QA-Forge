// AI-1: provider failures become classified, user-actionable errors; output is validated; calls time out.
import type { NextFunction, Request, Response } from 'express';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { ApiKeyProvider } from '@qaforge/shared-types';
import { AIProviderError, generateTestCases, optimizeTestCase } from '@qaforge/ai-engine';
import { errorHandler } from '../middleware/error-handler.js';

const reply = (status: number, body: unknown) =>
  vi.fn(async () => new Response(typeof body === 'string' ? body : JSON.stringify(body), { status }));
const generate = (provider = ApiKeyProvider.OPENAI) => generateTestCases({ prompt: 'login', provider, apiKey: 'sk-secret' });
const caught = async (p: Promise<unknown>) => p.then(() => { throw new Error('expected a rejection'); }, (e: unknown) => e as AIProviderError);

describe('AI provider errors', () => {
  afterEach(() => {
    vi.unstubAllGlobals();
    vi.unstubAllEnvs();
  });

  it.each([
    [401, 'bad key', 'AI_KEY_INVALID', 422],
    [403, 'forbidden', 'AI_KEY_INVALID', 422],
    [429, 'slow down', 'AI_RATE_LIMITED', 429],
    [500, 'boom', 'AI_PROVIDER_ERROR', 502],
  ])('HTTP %i from the provider → %s', async (status, body, code, httpStatus) => {
    vi.stubGlobal('fetch', reply(status, body));
    const err = await caught(generate());
    expect(err).toBeInstanceOf(AIProviderError);
    expect(err.code).toBe(code);
    expect(err.statusCode).toBe(httpStatus);
    expect(err.message).not.toContain('sk-secret');
  });

  it("classifies Gemini's 400 'API key not valid' as an invalid key", async () => {
    vi.stubGlobal('fetch', reply(400, { error: { message: 'API key not valid. Please pass a valid API key.' } }));
    expect((await caught(generate(ApiKeyProvider.GEMINI))).code).toBe('AI_KEY_INVALID');
  });

  it('times out a provider that never answers', async () => {
    vi.stubEnv('AI_TIMEOUT_MS', '50');
    vi.stubGlobal('fetch', vi.fn((_url: string, init: RequestInit) =>
      new Promise((_resolve, reject) => init.signal!.addEventListener('abort', () => reject(init.signal!.reason))),
    ));
    const started = Date.now();
    const err = await caught(generate(ApiKeyProvider.ANTHROPIC));
    expect(err.code).toBe('AI_TIMEOUT');
    expect(err.statusCode).toBe(504);
    expect(Date.now() - started).toBeLessThan(2_000);
  });

  it('rejects prose and contract-breaking output as AI_BAD_OUTPUT', async () => {
    vi.stubGlobal('fetch', reply(200, { choices: [{ message: { content: 'Sure! Here are some ideas…' } }] }));
    expect((await caught(generate())).code).toBe('AI_BAD_OUTPUT');

    const legacy = { title: 'Old', steps: [{ step_number: 1, instruction: 'Click login' }] }; // no action
    vi.stubGlobal('fetch', reply(200, { choices: [{ message: { content: JSON.stringify(legacy) } }] }));
    const err = await caught(
      optimizeTestCase({ title: 't', steps: [], provider: ApiKeyProvider.OPENAI, apiKey: 'k' }),
    );
    expect(err.code).toBe('AI_BAD_OUTPUT');
  });

  it('reports the model used', async () => {
    const tc = { title: 'Home', steps: [{ step_number: 1, action: 'assert_visible', instruction: 'Hero', selector: 'h1' }] };
    vi.stubGlobal('fetch', reply(200, { choices: [{ message: { content: JSON.stringify([tc]) } }] }));
    vi.stubEnv('OPENAI_MODEL', 'gpt-test');
    expect((await generate()).model_used).toBe('gpt-test');
  });

  it('the API error handler returns the classified status and code', () => {
    const res = { status: vi.fn().mockReturnThis(), json: vi.fn() } as unknown as Response;
    errorHandler(new AIProviderError('AI_RATE_LIMITED', 'wait'), { path: '/x', method: 'POST' } as Request, res, (() => {}) as NextFunction);
    expect(res.status).toHaveBeenCalledWith(429);
    expect(res.json).toHaveBeenCalledWith({ error: { code: 'AI_RATE_LIMITED', message: 'wait', details: null } });
  });
});
