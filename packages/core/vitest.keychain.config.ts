import { defineConfig } from 'vitest/config';

/**
 * `pnpm test:keychain`: the one run that reaches the real OS keychain, under the service
 * "DevHub test". Never part of `pnpm test`, `pnpm verify` or CI (spec 002, Q5).
 */
export default defineConfig({
  test: {
    name: 'core-keychain',
    root: import.meta.dirname,
    environment: 'node',
    include: ['src/**/*.real.test.ts'],
  },
});
