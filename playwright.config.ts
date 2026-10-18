import { accessSync, constants, existsSync, mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { delimiter, join } from 'node:path';
import { defineConfig, devices } from '@playwright/test';
import { fakeToolsHubPort } from './e2e/fake-tools/config.ts';

// The e2e run gets its own port and data folder, so it never touches the real ~/.devhub.
const port = 4399;
const home = mkdtempSync(join(tmpdir(), 'devhub-e2e-'));
const fakeToolsHome = mkdtempSync(join(tmpdir(), 'devhub-e2e-tools-'));

// The e2e server must find this fake gh, never your real one (spec 004, AC-20). Stop the run rather than
// let it fall back to the real gh: on Windows (DevHub looks for gh.exe), when the fake can't run, or when
// a folder pnpm puts ahead of it on PATH holds a gh of its own.
const fakeGh = join(import.meta.dirname, 'e2e', 'fake-gh');
if (process.platform === 'win32') {
  throw new Error('The e2e run fakes gh with a shell script (e2e/fake-gh/gh): run it on macOS or Linux.');
}
try {
  accessSync(join(fakeGh, 'gh'), constants.X_OK);
} catch {
  throw new Error('e2e/fake-gh/gh must be executable (chmod +x), or the e2e run could start your real gh.');
}
for (const bin of ['node_modules/.bin', 'apps/server/node_modules/.bin']) {
  if (existsSync(join(import.meta.dirname, bin, 'gh'))) {
    throw new Error(`${bin}/gh would run before the fake gh in the e2e run.`);
  }
}

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
  webServer: [
    {
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
        // A fake gh, always signed out, comes first on the server's PATH: the e2e run never reads your
        // real gh login, and a press of Connect GitHub never reaches github.com (spec 004, AC-20).
        PATH: `${fakeGh}${delimiter}${process.env['PATH'] ?? ''}`,
      },
    },
    {
      // The same build with Jira and GitHub faked inside the server (e2e/fake-tools/preload.ts), for the
      // specs that need rows on Home. It starts after the first server, so the build is already there.
      command: 'node --import ./e2e/fake-tools/preload.ts apps/server/dist/main.mjs --serve-web',
      url: `http://127.0.0.1:${String(fakeToolsHubPort)}/`,
      reuseExistingServer: false,
      timeout: 60_000,
      env: {
        DEVHUB_PORT: String(fakeToolsHubPort),
        DEVHUB_HOME: fakeToolsHome,
        LOG_LEVEL: 'warn',
        NODE_ENV: 'production',
        DEVHUB_TOKENS_FROM_ENV: 'false',
        DEVHUB_KEYCHAIN: 'memory',
        PATH: `${fakeGh}${delimiter}${process.env['PATH'] ?? ''}`,
      },
    },
  ],
});
