import { defineConfig } from '@playwright/test';

// The desktop app's e2e run (spec 027): it launches the packed app, so pack it first with
// `pnpm --filter @devhub/desktop package --dir`. Each test gives the app a home of its own and a free port.
export default defineConfig({
  testDir: 'e2e/desktop',
  // One app at a time: each one opens a window and a hub of its own.
  workers: 1,
  timeout: 60_000,
  forbidOnly: Boolean(process.env['CI']),
  retries: 0,
  reporter: process.env['CI'] ? [['github'], ['list']] : 'list',
});
