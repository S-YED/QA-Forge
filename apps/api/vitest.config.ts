import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    globals: true,
    environment: 'node',
    include: ['src/**/__tests__/**/*.test.ts', 'src/**/*.test.ts'],
    // Integration tests need a running local Supabase; run via `pnpm test:integration`.
    exclude: ['**/node_modules/**', '**/dist/**', 'src/**/*.int.test.ts'],
    coverage: {
      provider: 'v8',
      include: [
        'src/middleware/demo-guard.ts',
        'src/middleware/concurrency-limiter.ts',
        'src/utils/resolve-ai-key.ts',
        'src/utils/encryption.ts',
      ],
      reporter: ['text', 'text-summary'],
    },
  },
});
