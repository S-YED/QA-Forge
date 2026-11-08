import { describe, expect, it } from 'vitest';
import { devLine } from './logger.js';

describe('devLine', () => {
  it('prints the fields of an object message instead of [object Object]', () => {
    const line = devLine({ level: 'warn', message: { event: 'run:complete', status: 'error', errorMessage: 'boom' } as never });
    expect(line).toBe('warn: {"event":"run:complete","status":"error","errorMessage":"boom"}');
  });

  it('keeps plain text messages and appends extra fields', () => {
    expect(devLine({ level: 'info', message: 'API running' })).toBe('info: API running');
    expect(devLine({ level: 'error', message: 'Validation failed', path: '/x' })).toBe('error: Validation failed {"path":"/x"}');
  });
});
