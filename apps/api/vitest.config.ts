import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    globals: true,
    environment: 'node',
    include: ['src/**/__tests__/**/*.test.ts', 'src/**/*.test.ts'],
    exclude: ['src/utils/encryption.test.ts'],
    coverage: {
      provider: 'v8',
      include: [
        'src/middleware/demo-guard.ts',
        'src/middleware/concurrency-limiter.ts',
        'src/utils/resolve-ai-key.ts',
      ],
      reporter: ['text', 'text-summary'],
    },
  },
});
