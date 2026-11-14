#!/usr/bin/env node
// pnpm check-setup (`pnpm doctor` is a pnpm built-in, so not that name): checks that this machine can run QA Forge locally, and says how to fix what can't.
// Also the shared helpers for scripts/bootstrap.mjs. Zero dependencies.
import { spawnSync } from 'node:child_process';
import { copyFileSync, existsSync, readFileSync, writeFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

export const ROOT = fileURLToPath(new URL('..', import.meta.url));
export const API_ENV = join(ROOT, 'apps/api/.env');
export const WEB_ENV = join(ROOT, 'apps/web/.env.local');

/** Run a command; never throws. `inherit` streams its output to the terminal. */
export function run(cmd, args, { timeout = 60_000, inherit = false } = {}) {
  const r = spawnSync(cmd, args, {
    cwd: ROOT,
    shell: process.platform === 'win32', // pnpm/npx are .cmd shims on Windows
    timeout,
    encoding: 'utf8',
    stdio: inherit ? 'inherit' : 'pipe',
  });
  return { ok: r.status === 0 && !r.error, out: `${r.stdout ?? ''}${r.stderr ?? ''}`.trim(), timedOut: r.error?.code === 'ETIMEDOUT' };
}

/** Minimal KEY=value reader (comments and blank lines ignored). Null when the file is missing. */
export function readEnv(file) {
  if (!existsSync(file)) return null;
  const env = {};
  for (const line of readFileSync(file, 'utf8').split(/\r?\n/)) {
    const m = /^\s*([A-Z0-9_]+)\s*=\s*(.*?)\s*$/.exec(line);
    if (m) env[m[1]] = m[2].replace(/^["']|["']$/g, '');
  }
  return env;
}

export const isPlaceholder = (v) => !v || v.startsWith('replace-with-');

/**
 * Create `file` from `example` if missing, then set each key only where it is missing or still a
 * placeholder. Values the user set are never touched. Returns the keys it changed.
 */
export function fillEnv(file, example, values) {
  if (!existsSync(file)) copyFileSync(example, file);
  let text = readFileSync(file, 'utf8');
  const current = readEnv(file);
  const changed = [];
  for (const [key, value] of Object.entries(values)) {
    if (!value || !isPlaceholder(current[key])) continue;
    const pattern = new RegExp(`^${key}=.*$`, 'm');
    text = pattern.test(text) ? text.replace(pattern, `${key}=${value}`) : `${text.trimEnd()}\n${key}=${value}\n`;
    changed.push(key);
  }
  if (changed.length) writeFileSync(file, text);
  return changed;
}

/** `supabase status -o json`, or null when the local stack is not running. */
export function supabaseStatus() {
  const r = run('pnpm', ['exec', 'supabase', 'status', '-o', 'json'], { timeout: 60_000 });
  if (!r.ok) return null;
  try {
    return JSON.parse(r.out.slice(r.out.indexOf('{'), r.out.lastIndexOf('}') + 1));
  } catch {
    return null;
  }
}

/** Node, pnpm and a Docker engine that actually answers (it can hang with WSL on Windows). */
export function prerequisites() {
  const results = [];
  const add = (name, ok, detail, fix) => results.push({ name, ok, detail, fix });
  const major = Number(process.versions.node.split('.')[0]);
  add('Node.js 20 or newer', major >= 20, `found ${process.versions.node}`, 'Install Node.js 20 or newer from https://nodejs.org');
  const pnpm = run('pnpm', ['--version'], { timeout: 20_000 });
  add('pnpm', pnpm.ok, pnpm.ok ? pnpm.out : 'not found', 'Run: corepack enable');
  const docker = run('docker', ['info', '--format', '{{.ServerVersion}}'], { timeout: 20_000 });
  add(
    'Docker engine',
    docker.ok,
    docker.ok ? `server ${docker.out}` : docker.timedOut ? 'not answering (timed out)' : 'not running',
    docker.timedOut
      ? 'Docker is hung. On Windows: quit Docker Desktop, run `wsl --shutdown` (or reboot), then reopen Docker Desktop.'
      : 'Start Docker Desktop (or the Docker service) and try again.',
  );
  return results;
}

export function checks() {
  const results = prerequisites();
  const add = (name, ok, detail, fix) => results.push({ name, ok, detail, fix });

  const sb = results[2].ok ? supabaseStatus() : null;
  add('Local Supabase running', !!sb?.API_URL, sb?.API_URL ?? 'not running', 'Run: pnpm db:start');

  const api = readEnv(API_ENV);
  const apiMissing = api ? ['SUPABASE_URL', 'SUPABASE_ANON_KEY', 'SUPABASE_SERVICE_ROLE_KEY'].filter((k) => isPlaceholder(api[k])) : ['the file'];
  add('apps/api/.env', apiMissing.length === 0, apiMissing.length ? `missing ${apiMissing.join(', ')}` : 'Supabase keys set', 'Run: pnpm bootstrap');
  add(
    'ENCRYPTION_KEY (64 hex characters)',
    !!api && /^[0-9a-fA-F]{64}$/.test(api.ENCRYPTION_KEY ?? ''),
    api?.ENCRYPTION_KEY ? 'set but not 64 hex characters' : 'missing',
    'Run: pnpm bootstrap (it generates one when empty and never changes an existing key)',
  );
  if (results.at(-1).ok) results.at(-1).detail = 'set';
  if (sb?.API_URL && api && !isPlaceholder(api.SUPABASE_URL)) {
    const same = api.SUPABASE_URL.replace('localhost', '127.0.0.1') === sb.API_URL.replace('localhost', '127.0.0.1');
    add('API uses the local Supabase', same, same ? sb.API_URL : `${api.SUPABASE_URL} (local is ${sb.API_URL})`, 'Set SUPABASE_URL in apps/api/.env to the local API URL, unless you meant a remote project.');
  }

  const web = readEnv(WEB_ENV);
  const webMissing = web ? ['NEXT_PUBLIC_SUPABASE_URL', 'NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY'].filter((k) => isPlaceholder(web[k])) : ['the file'];
  add('apps/web/.env.local', webMissing.length === 0, webMissing.length ? `missing ${webMissing.join(', ')}` : 'Supabase keys set', 'Run: pnpm bootstrap');

  let chromium = '';
  try {
    chromium = createRequire(join(ROOT, 'packages/playwright-runner/package.json'))('playwright').chromium.executablePath();
  } catch {
    /* playwright not installed yet */
  }
  add('Playwright Chromium', !!chromium && existsSync(chromium), chromium && existsSync(chromium) ? 'installed' : 'not installed', 'Run: pnpm --filter @qaforge/playwright-runner exec playwright install chromium');
  return results;
}

/** Print results; true when everything passed. */
export function printChecks(results) {
  for (const r of results) console.log(`${r.ok ? ' ok ' : 'FAIL'}  ${r.name}: ${r.detail}${r.ok ? '' : `\n      fix: ${r.fix}`}`);
  return results.every((r) => r.ok);
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  console.log('QA Forge doctor\n');
  const ok = printChecks(checks());
  console.log(ok ? '\nAll checks passed. Start everything with: pnpm dev' : '\nFix the items marked FAIL, then run pnpm check-setup again.');
  process.exit(ok ? 0 : 1);
}
