// DX-1: the API boots from apps/api/.env.example once ENCRYPTION_KEY is generated, a bad key
// fails with a readable message, and the web template lists exactly the vars the web code reads.
import { randomBytes } from 'node:crypto';
import { readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { parse } from 'dotenv';
import { afterEach, describe, expect, it, vi } from 'vitest';

const fromApi = (p: string) => fileURLToPath(new URL(`../../${p}`, import.meta.url));
const apiExample = parse(readFileSync(fromApi('.env.example')));
const webExample = parse(readFileSync(fromApi('../web/.env.example')));
const savedEnv = { ...process.env };

/** Import config/env.ts fresh with exactly these variables; returns the env or the startup error. */
async function boot(vars: Record<string, string>) {
  vi.resetModules();
  process.env = { ...vars };
  const errors: string[] = [];
  vi.spyOn(console, 'error').mockImplementation((msg: string) => void errors.push(msg));
  vi.spyOn(process, 'exit').mockImplementation(((code: number) => {
    throw new Error(`exit ${code}`);
  }) as never);
  try {
    return { env: (await import('../config/env.js')).env, error: undefined };
  } catch (err) {
    return { env: undefined, error: `${(err as Error).message}\n${errors.join('\n')}` };
  }
}

afterEach(() => {
  process.env = { ...savedEnv };
  vi.restoreAllMocks();
});

describe('apps/api/.env.example', () => {
  it('boots once ENCRYPTION_KEY is generated', async () => {
    const { env, error } = await boot({ ...apiExample, ENCRYPTION_KEY: randomBytes(32).toString('hex') });
    expect(error).toBeUndefined();
    expect(env?.SUPABASE_URL).toBe('http://127.0.0.1:54321');
    expect(env?.ALLOWED_PRIVATE_HOSTS).toEqual(['*']);
    expect(env?.AI_LOCAL_DEMO).toBe(true);
  });

  it('refuses a missing or non-hex ENCRYPTION_KEY with a readable message', async () => {
    for (const key of ['', 'z'.repeat(64)]) {
      const { error } = await boot({ ...apiExample, ENCRYPTION_KEY: key });
      expect(error).toMatch(/^exit 1/);
      expect(error).toMatch(/ENCRYPTION_KEY: must be 64 hex characters\. Generate one with: node -e/);
    }
  });
});

describe('apps/web/.env.example', () => {
  it('lists exactly the NEXT_PUBLIC_ variables the web code reads', () => {
    const webRoot = fromApi('../web');
    const read = new Set<string>();
    for (const dir of ['app', 'components', 'lib']) {
      for (const file of readdirSync(join(webRoot, dir), { recursive: true }) as string[]) {
        if (!/\.(ts|tsx)$/.test(file)) continue;
        for (const m of readFileSync(join(webRoot, dir, file), 'utf8').matchAll(/process\.env\.(NEXT_PUBLIC_\w+)/g)) read.add(m[1]);
      }
    }
    for (const m of readFileSync(join(webRoot, 'middleware.ts'), 'utf8').matchAll(/process\.env\.(NEXT_PUBLIC_\w+)/g)) read.add(m[1]);
    expect(Object.keys(webExample).sort()).toEqual([...read].sort());
  });
});
