#!/usr/bin/env node
// pnpm bootstrap: from a fresh clone to a runnable local QA Forge in one command.
// Safe to rerun: it never overwrites a value you set, never resets the database,
// and every step it repeats is idempotent.
import { randomBytes } from 'node:crypto';
import { join } from 'node:path';
import { API_ENV, ROOT, WEB_ENV, checks, fillEnv, prerequisites, printChecks, run, supabaseStatus } from './doctor.mjs';

const step = (msg) => console.log(`\n> ${msg}`);
const stop = (msg) => {
  console.error(`\nbootstrap stopped: ${msg}`);
  process.exit(1);
};
const must = (result, what) => result.ok || stop(`${what} failed (see the output above).`);

step('Checking Node.js, pnpm and Docker');
if (!printChecks(prerequisites())) stop('fix the items marked FAIL, then run pnpm bootstrap again.');

step('Installing dependencies');
must(run('pnpm', ['install'], { inherit: true, timeout: 900_000 }), 'pnpm install');

step('Building shared packages');
must(run('pnpm', ['turbo', 'run', 'build', '--filter=./packages/*'], { inherit: true, timeout: 900_000 }), 'Building packages');

step('Starting local Supabase (the first start downloads images and seeds the database)');
must(run('pnpm', ['exec', 'supabase', 'start'], { inherit: true, timeout: 1_800_000 }), 'supabase start');

step('Applying any new migrations (no reset; your local data stays)');
must(run('pnpm', ['exec', 'supabase', 'migration', 'up'], { inherit: true, timeout: 300_000 }), 'supabase migration up');

step('Writing local settings (only missing values)');
const sb = supabaseStatus() ?? stop('could not read `supabase status`.');
const apiChanged = fillEnv(API_ENV, join(ROOT, 'apps/api/.env.example'), {
  SUPABASE_URL: sb.API_URL,
  SUPABASE_ANON_KEY: sb.ANON_KEY,
  SUPABASE_SERVICE_ROLE_KEY: sb.SERVICE_ROLE_KEY,
  ENCRYPTION_KEY: randomBytes(32).toString('hex'), // used only when the key is empty
});
const webChanged = fillEnv(WEB_ENV, join(ROOT, 'apps/web/.env.example'), {
  NEXT_PUBLIC_SUPABASE_URL: sb.API_URL,
  NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY: sb.PUBLISHABLE_KEY ?? sb.ANON_KEY,
});
console.log(`apps/api/.env: ${apiChanged.length ? `set ${apiChanged.join(', ')}` : 'already complete'}`);
console.log(`apps/web/.env.local: ${webChanged.length ? `set ${webChanged.join(', ')}` : 'already complete'}`);

step('Installing the Chromium browser that test runs use');
must(run('pnpm', ['--filter', '@qaforge/playwright-runner', 'exec', 'playwright', 'install', 'chromium'], { inherit: true, timeout: 900_000 }), 'playwright install');

step('Checking the result');
if (!printChecks(checks())) stop('some checks failed; the fixes are listed above.');

console.log(`
QA Forge is ready.

  pnpm dev     starts the web app (http://localhost:3000), the API (http://localhost:4000)
               and the demo shop to test against (http://127.0.0.1:4100)

Sign in with alice@qaforge.dev / Password123!, create a project with base URL
http://127.0.0.1:4100/, and click AI generate. Without an AI key you get the local demo
tests (labelled "Local demo, not AI"); add a key in Settings for real generation.`);
