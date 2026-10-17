import { fileURLToPath } from 'node:url';
import { defineProject } from 'vitest/config';

export default defineProject({
  // Server tests run core too; none of them may reach the real OS keychain.
  resolve: {
    alias: {
      '@napi-rs/keyring': fileURLToPath(new URL('../../packages/core/src/test/no-real-keychain.ts', import.meta.url)),
    },
  },
  test: {
    name: 'server',
    environment: 'node',
    include: ['src/**/*.test.ts'],
  },
});
