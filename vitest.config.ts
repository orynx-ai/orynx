import { defineConfig } from 'vitest/config';

/** One `pnpm test` for every package; each package's vitest.config.ts sets its environment. */
export default defineConfig({
  test: {
    // The landing page is static HTML with no tests (the user's call).
    projects: ['packages/*', 'apps/*', '!apps/landing'],
    coverage: {
      provider: 'v8',
      include: ['packages/*/src/**/*.{ts,tsx}', 'apps/*/src/**/*.{ts,tsx}'],
      // What is not worth a unit test, and why. Add to this list only with a reason.
      exclude: [
        '**/*.test.{ts,tsx}',
        '**/*.stories.tsx',
        '**/src/test/**', // test helpers
        '**/src/index.ts', // re-exports only
        '**/src/testing.ts', // test helpers shipped to other packages
        'apps/server/src/main.ts', // process entry: covered by the e2e smoke test
        'apps/web/src/main.tsx', // browser entry: covered by the e2e smoke test
        'apps/landing/**', // static landing page: checked in a browser, not unit tested
        'packages/core/src/agents/agent-adapter.ts', // types only until roadmap 010
      ],
      thresholds: { lines: 90, functions: 90, branches: 90, statements: 90 },
      reporter: ['text-summary', 'html'],
    },
  },
});
