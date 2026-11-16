import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    include: [
      'packages/shared/src/**/*.test.ts',
      'packages/extension/src/**/*.test.ts',
      'packages/extension/scripts/**/*.test.ts',
      'sites/**/*.test.ts',
      'scripts/**/*.test.ts',
      'dev/**/*.test.ts',
    ],
    environment: 'node',
  },
});
