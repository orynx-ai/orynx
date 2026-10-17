import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { defineConfig, devices } from '@playwright/test';

// The e2e run gets its own port and data folder, so it never touches the real ~/.devhub.
const port = 4399;
const home = mkdtempSync(join(tmpdir(), 'devhub-e2e-'));

export default defineConfig({
  testDir: 'e2e',
  fullyParallel: true,
  forbidOnly: Boolean(process.env['CI']),
  retries: process.env['CI'] ? 1 : 0,
  reporter: process.env['CI'] ? [['github'], ['html', { open: 'never' }]] : 'list',
  use: {
    baseURL: `http://127.0.0.1:${String(port)}`,
    trace: 'retain-on-failure',
  },
  projects: [
    { name: 'desktop', use: { ...devices['Desktop Chrome'], viewport: { width: 1280, height: 800 } } },
    { name: 'phone', use: { ...devices['Desktop Chrome'], viewport: { width: 360, height: 780 } } },
  ],
  webServer: {
    command: 'pnpm start',
    url: `http://127.0.0.1:${String(port)}/`,
    reuseExistingServer: false,
    timeout: 180_000,
    // The shell beats the repo's .env, so a developer's .env tokens never reach the e2e server.
    env: {
      DEVHUB_PORT: String(port),
      DEVHUB_HOME: home,
      LOG_LEVEL: 'warn',
      NODE_ENV: 'production',
      DEVHUB_TOKENS_FROM_ENV: 'false',
      // Tokens in memory only: the e2e run never reads or writes your real "DevHub" keychain item.
      DEVHUB_KEYCHAIN: 'memory',
    },
  },
});
