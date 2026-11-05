import { defineConfig } from 'vitest/config';

// Integration tests: real local Supabase (`supabase start` + `supabase db reset`)
// and the Express app in-process. Env comes from apps/api/.env.
export default defineConfig({
  test: {
    globals: true,
    environment: 'node',
    include: ['src/**/*.int.test.ts'],
    setupFiles: ['dotenv/config'],
    testTimeout: 30_000,
    fileParallelism: false,
  },
});
