import { fileURLToPath } from 'node:url';
import { defineProject } from 'vitest/config';

export default defineProject({
  // No unit test may reach the real OS keychain; `pnpm test:keychain` has its own config.
  resolve: { alias: { '@napi-rs/keyring': fileURLToPath(new URL('src/test/no-real-keychain.ts', import.meta.url)) } },
  test: {
    name: 'core',
    environment: 'node',
    include: ['src/**/*.test.ts'],
    exclude: ['src/**/*.real.test.ts'],
  },
});
