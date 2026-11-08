import { defineConfig } from '@playwright/test';

// QA-3: end-to-end tests through the real web app, API, local Supabase and demo shop.
// Prereq: `pnpm bootstrap` (local Supabase + env files). Servers already running are reused;
// otherwise they are started here. E2E_WEB_URL picks another web port (e.g. 3005).
const WEB = process.env.E2E_WEB_URL ?? 'http://localhost:3000';

export default defineConfig({
  testDir: '.',
  outputDir: '../.e2e-results',
  timeout: 240_000,
  expect: { timeout: 20_000 },
  workers: 1,
  retries: process.env.CI ? 1 : 0,
  reporter: [['list']],
  use: { baseURL: WEB, trace: 'retain-on-failure', screenshot: 'only-on-failure' },
  webServer: [
    { command: 'pnpm --filter @qaforge/api dev', url: 'http://localhost:4000/api/health', reuseExistingServer: true, timeout: 120_000, cwd: '..' },
    {
      command: 'pnpm --filter @qaforge/web dev',
      url: `${WEB}/login`,
      reuseExistingServer: true,
      timeout: 240_000,
      cwd: '..',
      env: { PORT: new URL(WEB).port || '3000' },
    },
    { command: 'node apps/demo-app/server.mjs', url: 'http://127.0.0.1:4100/', reuseExistingServer: true, timeout: 30_000, cwd: '..' },
  ],
});
