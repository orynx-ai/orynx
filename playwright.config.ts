import { accessSync, constants, existsSync, mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { delimiter, join } from 'node:path';
import { defineConfig, devices } from '@playwright/test';
import { fakeClaude, fakeClaudeDirFor } from './e2e/fake-claude/config.ts';
import { fakeReleasesPort, fakeReleasesUrl } from './e2e/fake-tools/releases.ts';
import { setUpHome } from './e2e/set-up.ts';
import {
  approvalsHubPort,
  changesHubPort,
  composerHubPort,
  fakeToolsHubPort,
  pullRequestsHubPort,
  sessionsHubPort,
  syncActivityHubPort,
  chatHubPort,
  terminalHubPort,
  orynxTicketsHubPort,
} from './e2e/fake-tools/config.ts';

// The e2e run gets its own port and data folder, so it never touches the real ~/.devhub. Each starts set up (spec 043).
const port = 4399;
const home = setUpHome(mkdtempSync(join(tmpdir(), 'devhub-e2e-')));
const fakeToolsHome = setUpHome(mkdtempSync(join(tmpdir(), 'devhub-e2e-tools-')));
const sessionsHome = setUpHome(mkdtempSync(join(tmpdir(), 'devhub-e2e-sessions-')));
const approvalsHome = setUpHome(mkdtempSync(join(tmpdir(), 'devhub-e2e-approvals-')));
const changesHome = setUpHome(mkdtempSync(join(tmpdir(), 'devhub-e2e-changes-')));
const composerHome = setUpHome(mkdtempSync(join(tmpdir(), 'devhub-e2e-composer-')));
const syncActivityHome = setUpHome(mkdtempSync(join(tmpdir(), 'devhub-e2e-sync-activity-')));
const chatHome = setUpHome(mkdtempSync(join(tmpdir(), 'devhub-e2e-chat-')));
const terminalHome = setUpHome(mkdtempSync(join(tmpdir(), 'devhub-e2e-terminal-')));
const orynxTicketsHome = setUpHome(mkdtempSync(join(tmpdir(), 'devhub-e2e-orynx-tickets-')));
const pullRequestsHome = setUpHome(mkdtempSync(join(tmpdir(), 'devhub-e2e-pull-requests-')));
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

// Every hub's settings. The shell beats the repo's .env, so a developer's .env tokens never reach an e2e server.
const hubEnv = {
  LOG_LEVEL: 'warn',
  NODE_ENV: 'production',
  DEVHUB_TOKENS_FROM_ENV: 'false',
  // Tokens in memory only: the e2e run never reads or writes your real "DevHub" keychain item.
  DEVHUB_KEYCHAIN: 'memory',
  // A fake gh, always signed out, comes first on the server's PATH: the e2e run never reads your
  // real gh login, and a press of Connect GitHub never reaches github.com (spec 004, AC-20).
  PATH: `${fakeGh}${delimiter}${process.env['PATH'] ?? ''}`,
  // Always signed out, unless the hub gives it an answer folder (CLAUDE_CONFIG_DIR).
  DEVHUB_CLAUDE_CODE: fakeClaude,
  // The fake Claude Code has no sandbox; Orynx would otherwise give it no commands (spec 012).
  DEVHUB_SANDBOX: 'assume',
  // Every hub checks for updates with the fake releases, never api.github.com (spec 045, AC-24).
  DEVHUB_RELEASES_URL: fakeReleasesUrl,
};

/**
 * A hub on the build the first one made, with Jira and GitHub faked inside the server (e2e/fake-tools/preload.ts), a
 * port and data folder of its own, and a fake Claude Code that answers what its specs write into its folder.
 */
function hub(port: number, home: string, env: Record<string, string> = {}) {
  return {
    command: 'node --import ./e2e/fake-tools/preload.ts apps/server/dist/main.mjs --serve-web',
    url: `http://127.0.0.1:${String(port)}/`,
    reuseExistingServer: false,
    timeout: 60_000,
    env: {
      DEVHUB_PORT: String(port),
      DEVHUB_HOME: home,
      ...hubEnv,
      // env-policy-ignore-next-line: Claude Code's own setting, which only the fake reads; DevHub never does
      CLAUDE_CONFIG_DIR: fakeClaudeDirFor(port),
      ...env,
    },
  };
}

export default defineConfig({
  testDir: 'e2e',
  // The desktop app's own run (playwright.desktop.config.ts) launches the packed app instead of these hubs.
  testIgnore: ['desktop/**'],
  fullyParallel: true,
  forbidOnly: Boolean(process.env['CI']),
  retries: process.env['CI'] ? 1 : 0,
  // CI runs three shards; each writes a blob, and one job merges them into the HTML report (spec 049).
  reporter: process.env['CI'] ? [['github'], ['blob']] : 'list',
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
      // GitHub's releases for Settings › About (spec 045), first, so every hub's check at start finds it.
      command: 'node e2e/fake-tools/releases.ts',
      url: `http://127.0.0.1:${String(fakeReleasesPort)}/`,
      reuseExistingServer: false,
      timeout: 30_000,
    },
    {
      // The first hub builds the app, with nothing faked: no Jira, no GitHub, and Claude Code always signed out.
      command: 'pnpm start',
      url: `http://127.0.0.1:${String(port)}/`,
      reuseExistingServer: false,
      timeout: 180_000,
      env: { DEVHUB_PORT: String(port), DEVHUB_HOME: home, ...hubEnv },
    },
    // Jira and GitHub faked, for the specs that need rows on Home; coding-agent.spec.ts writes its Claude's answers.
    hub(fakeToolsHubPort, fakeToolsHome),
    // Sessions (spec 011): its sessions, worktrees and fake Claude Code stay away from the other specs. The fake
    // Claude Code plays one scripted run (e2e/fake-claude/session.ts).
    hub(sessionsHubPort, sessionsHome),
    // Approvals (spec 012): their tests change the permission mode and the allow list.
    hub(approvalsHubPort, approvalsHome),
    // Live changes and follow-ups (spec 013): their sessions resume Claude Code, and their folder maps its own project.
    hub(changesHubPort, changesHome),
    // Create pull request (spec 014): its sessions commit and push, to a bare repository standing in for github.com,
    // and its fake GitHub opens pull requests.
    hub(pullRequestsHubPort, pullRequestsHome, { HOME: pullRequestsGitHome }),
    // Home's composer (spec 015): its sessions start without Ship, and its fakes give pull requests' details and diffs.
    hub(composerHubPort, composerHome),
    // Sync activity (spec 035): its Sync now and its log never move Home's inbox spec.
    hub(syncActivityHubPort, syncActivityHome),
    // Slack and Discord (spec 016): connecting them never adds tabs to Home's inbox spec.
    hub(chatHubPort, chatHome),
    // The session Terminal (spec 036): your commands run in its sessions' worktrees.
    hub(terminalHubPort, terminalHome, {
      // env-policy-ignore-next-line: the shell your Terminal runs; /bin/sh keeps your own shell's startup files out
      SHELL: '/bin/sh',
    }),
    {
      // Orynx's own tickets (spec 037), with no Jira and no fakes: the tickets made here and its agents' door never
      // reach the Tickets spec, which expects none.
      command: 'node apps/server/dist/main.mjs --serve-web',
      url: `http://127.0.0.1:${String(orynxTicketsHubPort)}/`,
      reuseExistingServer: false,
      timeout: 60_000,
      env: { DEVHUB_PORT: String(orynxTicketsHubPort), DEVHUB_HOME: orynxTicketsHome, ...hubEnv },
    },
  ],
});
