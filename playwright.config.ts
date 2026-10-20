import { accessSync, constants, existsSync, mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { delimiter, join } from 'node:path';
import { defineConfig, devices } from '@playwright/test';
import { fakeClaude, fakeClaudeDir, fakeClaudeDirFor } from './e2e/fake-claude/config.ts';
import {
  approvalsHubPort,
  changesHubPort,
  composerHubPort,
  fakeToolsHubPort,
  pullRequestsHubPort,
  sessionsHubPort,
  syncActivityHubPort,
  terminalHubPort,
  orynxTicketsHubPort,
} from './e2e/fake-tools/config.ts';

// The e2e run gets its own port and data folder, so it never touches the real ~/.devhub.
const port = 4399;
const home = mkdtempSync(join(tmpdir(), 'devhub-e2e-'));
const fakeToolsHome = mkdtempSync(join(tmpdir(), 'devhub-e2e-tools-'));
const sessionsHome = mkdtempSync(join(tmpdir(), 'devhub-e2e-sessions-'));
const approvalsHome = mkdtempSync(join(tmpdir(), 'devhub-e2e-approvals-'));
const changesHome = mkdtempSync(join(tmpdir(), 'devhub-e2e-changes-'));
const composerHome = mkdtempSync(join(tmpdir(), 'devhub-e2e-composer-'));
const syncActivityHome = mkdtempSync(join(tmpdir(), 'devhub-e2e-sync-activity-'));
const terminalHome = mkdtempSync(join(tmpdir(), 'devhub-e2e-terminal-'));
const orynxTicketsHome = mkdtempSync(join(tmpdir(), 'devhub-e2e-orynx-tickets-'));
const pullRequestsHome = mkdtempSync(join(tmpdir(), 'devhub-e2e-pull-requests-'));
// The pull requests hub's git commits with a name of its own, and never reads your ~/.gitconfig: your
// name, your signing (which could ask for a passphrase) or your aliases (spec 014).
const pullRequestsGitHome = mkdtempSync(join(tmpdir(), 'devhub-e2e-pull-requests-git-'));
writeFileSync(
  join(pullRequestsGitHome, '.gitconfig'),
  '[init]\n\tdefaultBranch = main\n[user]\n\tname = Orynx e2e\n\temail = e2e@example.com\n',
);

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

// The same for Claude Code (spec 010, AC-12): every hub runs this fake through DEVHUB_CLAUDE_CODE, never
// the one in the Agent SDK, which would read your real Claude login.
try {
  accessSync(fakeClaude, constants.X_OK);
} catch {
  throw new Error('e2e/fake-claude/claude must be executable (chmod +x), or the e2e run could not check Claude.');
}

export default defineConfig({
  testDir: 'e2e',
  // The desktop app's own run (playwright.desktop.config.ts) launches the packed app instead of these hubs.
  testIgnore: ['desktop/**'],
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
        // Always signed out: this hub's fake Claude Code gets no answer folder.
        DEVHUB_CLAUDE_CODE: fakeClaude,
        // The fake Claude Code has no sandbox; Orynx would otherwise give it no commands (spec 012).
        DEVHUB_SANDBOX: 'assume',
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
        // This hub's fake Claude Code answers what coding-agent.spec.ts writes into its folder.
        DEVHUB_CLAUDE_CODE: fakeClaude,
        // The fake Claude Code has no sandbox; Orynx would otherwise give it no commands (spec 012).
        DEVHUB_SANDBOX: 'assume',
        // env-policy-ignore-next-line: Claude Code's own setting, which only the fake reads; DevHub never does
        CLAUDE_CONFIG_DIR: fakeClaudeDir,
      },
    },
    {
      // The same again for sessions (spec 011): its sessions, worktrees and fake Claude Code stay away from
      // the other specs. The fake Claude Code plays one scripted run (e2e/fake-claude/session.ts).
      command: 'node --import ./e2e/fake-tools/preload.ts apps/server/dist/main.mjs --serve-web',
      url: `http://127.0.0.1:${String(sessionsHubPort)}/`,
      reuseExistingServer: false,
      timeout: 60_000,
      env: {
        DEVHUB_PORT: String(sessionsHubPort),
        DEVHUB_HOME: sessionsHome,
        LOG_LEVEL: 'warn',
        NODE_ENV: 'production',
        DEVHUB_TOKENS_FROM_ENV: 'false',
        DEVHUB_KEYCHAIN: 'memory',
        PATH: `${fakeGh}${delimiter}${process.env['PATH'] ?? ''}`,
        DEVHUB_CLAUDE_CODE: fakeClaude,
        // The fake Claude Code has no sandbox; Orynx would otherwise give it no commands (spec 012).
        DEVHUB_SANDBOX: 'assume',
        // env-policy-ignore-next-line: Claude Code's own setting, which only the fake reads; DevHub never does
        CLAUDE_CONFIG_DIR: fakeClaudeDirFor(sessionsHubPort),
      },
    },
    {
      // Approvals (spec 012) on a hub of their own: their tests change the permission mode and the allow list.
      command: 'node --import ./e2e/fake-tools/preload.ts apps/server/dist/main.mjs --serve-web',
      url: `http://127.0.0.1:${String(approvalsHubPort)}/`,
      reuseExistingServer: false,
      timeout: 60_000,
      env: {
        DEVHUB_PORT: String(approvalsHubPort),
        DEVHUB_HOME: approvalsHome,
        LOG_LEVEL: 'warn',
        NODE_ENV: 'production',
        DEVHUB_TOKENS_FROM_ENV: 'false',
        DEVHUB_KEYCHAIN: 'memory',
        PATH: `${fakeGh}${delimiter}${process.env['PATH'] ?? ''}`,
        DEVHUB_CLAUDE_CODE: fakeClaude,
        DEVHUB_SANDBOX: 'assume',
        // env-policy-ignore-next-line: Claude Code's own setting, which only the fake reads; DevHub never does
        CLAUDE_CONFIG_DIR: fakeClaudeDirFor(approvalsHubPort),
      },
    },
    {
      // Live changes and follow-ups (spec 013) on a hub of their own: their sessions resume Claude Code, and
      // their folder maps its own project.
      command: 'node --import ./e2e/fake-tools/preload.ts apps/server/dist/main.mjs --serve-web',
      url: `http://127.0.0.1:${String(changesHubPort)}/`,
      reuseExistingServer: false,
      timeout: 60_000,
      env: {
        DEVHUB_PORT: String(changesHubPort),
        DEVHUB_HOME: changesHome,
        LOG_LEVEL: 'warn',
        NODE_ENV: 'production',
        DEVHUB_TOKENS_FROM_ENV: 'false',
        DEVHUB_KEYCHAIN: 'memory',
        PATH: `${fakeGh}${delimiter}${process.env['PATH'] ?? ''}`,
        DEVHUB_CLAUDE_CODE: fakeClaude,
        DEVHUB_SANDBOX: 'assume',
        // env-policy-ignore-next-line: Claude Code's own setting, which only the fake reads; DevHub never does
        CLAUDE_CONFIG_DIR: fakeClaudeDirFor(changesHubPort),
      },
    },
    {
      // Create pull request (spec 014) on a hub of its own: its sessions commit and push, to a bare repository
      // standing in for github.com, and its fake GitHub opens pull requests.
      command: 'node --import ./e2e/fake-tools/preload.ts apps/server/dist/main.mjs --serve-web',
      url: `http://127.0.0.1:${String(pullRequestsHubPort)}/`,
      reuseExistingServer: false,
      timeout: 60_000,
      env: {
        DEVHUB_PORT: String(pullRequestsHubPort),
        DEVHUB_HOME: pullRequestsHome,
        HOME: pullRequestsGitHome,
        LOG_LEVEL: 'warn',
        NODE_ENV: 'production',
        DEVHUB_TOKENS_FROM_ENV: 'false',
        DEVHUB_KEYCHAIN: 'memory',
        PATH: `${fakeGh}${delimiter}${process.env['PATH'] ?? ''}`,
        DEVHUB_CLAUDE_CODE: fakeClaude,
        DEVHUB_SANDBOX: 'assume',
        // env-policy-ignore-next-line: Claude Code's own setting, which only the fake reads; DevHub never does
        CLAUDE_CONFIG_DIR: fakeClaudeDirFor(pullRequestsHubPort),
      },
    },
    {
      // Home's composer (spec 015) on a hub of its own: its sessions start without Ship, and its fakes give
      // pull requests' details and diffs.
      command: 'node --import ./e2e/fake-tools/preload.ts apps/server/dist/main.mjs --serve-web',
      url: `http://127.0.0.1:${String(composerHubPort)}/`,
      reuseExistingServer: false,
      timeout: 60_000,
      env: {
        DEVHUB_PORT: String(composerHubPort),
        DEVHUB_HOME: composerHome,
        LOG_LEVEL: 'warn',
        NODE_ENV: 'production',
        DEVHUB_TOKENS_FROM_ENV: 'false',
        DEVHUB_KEYCHAIN: 'memory',
        PATH: `${fakeGh}${delimiter}${process.env['PATH'] ?? ''}`,
        DEVHUB_CLAUDE_CODE: fakeClaude,
        DEVHUB_SANDBOX: 'assume',
        // env-policy-ignore-next-line: Claude Code's own setting, which only the fake reads; DevHub never does
        CLAUDE_CONFIG_DIR: fakeClaudeDirFor(composerHubPort),
      },
    },
    {
      // Sync activity (spec 035) on a hub of its own: its Sync now and its log never move Home's inbox spec.
      command: 'node --import ./e2e/fake-tools/preload.ts apps/server/dist/main.mjs --serve-web',
      url: `http://127.0.0.1:${String(syncActivityHubPort)}/`,
      reuseExistingServer: false,
      timeout: 60_000,
      env: {
        DEVHUB_PORT: String(syncActivityHubPort),
        DEVHUB_HOME: syncActivityHome,
        LOG_LEVEL: 'warn',
        NODE_ENV: 'production',
        DEVHUB_TOKENS_FROM_ENV: 'false',
        DEVHUB_KEYCHAIN: 'memory',
        PATH: `${fakeGh}${delimiter}${process.env['PATH'] ?? ''}`,
        DEVHUB_CLAUDE_CODE: fakeClaude,
        DEVHUB_SANDBOX: 'assume',
        // env-policy-ignore-next-line: Claude Code's own setting, which only the fake reads; DevHub never does
        CLAUDE_CONFIG_DIR: fakeClaudeDirFor(syncActivityHubPort),
      },
    },
    {
      // The session Terminal (spec 036) on a hub of its own: your commands run in its sessions' worktrees.
      command: 'node --import ./e2e/fake-tools/preload.ts apps/server/dist/main.mjs --serve-web',
      url: `http://127.0.0.1:${String(terminalHubPort)}/`,
      reuseExistingServer: false,
      timeout: 60_000,
      env: {
        DEVHUB_PORT: String(terminalHubPort),
        DEVHUB_HOME: terminalHome,
        LOG_LEVEL: 'warn',
        NODE_ENV: 'production',
        DEVHUB_TOKENS_FROM_ENV: 'false',
        DEVHUB_KEYCHAIN: 'memory',
        PATH: `${fakeGh}${delimiter}${process.env['PATH'] ?? ''}`,
        DEVHUB_CLAUDE_CODE: fakeClaude,
        DEVHUB_SANDBOX: 'assume',
        // env-policy-ignore-next-line: Claude Code's own setting, which only the fake reads; DevHub never does
        CLAUDE_CONFIG_DIR: fakeClaudeDirFor(terminalHubPort),
      },
    },
    {
      // Orynx's own tickets (spec 037) on a hub of their own, with no Jira and no fakes: the tickets made here and
      // its agents' door never reach the Tickets spec, which expects none.
      command: 'node apps/server/dist/main.mjs --serve-web',
      url: `http://127.0.0.1:${String(orynxTicketsHubPort)}/`,
      reuseExistingServer: false,
      timeout: 60_000,
      env: {
        DEVHUB_PORT: String(orynxTicketsHubPort),
        DEVHUB_HOME: orynxTicketsHome,
        LOG_LEVEL: 'warn',
        NODE_ENV: 'production',
        DEVHUB_TOKENS_FROM_ENV: 'false',
        DEVHUB_KEYCHAIN: 'memory',
        PATH: `${fakeGh}${delimiter}${process.env['PATH'] ?? ''}`,
        DEVHUB_CLAUDE_CODE: fakeClaude,
        DEVHUB_SANDBOX: 'assume',
      },
    },
  ],
});
