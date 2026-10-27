import { readFileSync } from 'node:fs';
import type { AddressInfo } from 'node:net';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { query } from '@anthropic-ai/claude-agent-sdk';
import {
  cacheFilePath,
  claudeWorkFolder,
  createClaudeCode,
  createFileSettingsStore,
  createFilePicker,
  createFolderPicker,
  createGhCli,
  createMemoryKeychain,
  createOrynxTicketStore,
  createOsKeychain,
  createPasswordStore,
  createServer,
  findSdkClaudeCode,
  openFileSessionStore,
  openInboxCache,
  passwordFilePath,
  sandboxAvailable,
  settingsFilePath,
} from '@devhub/core';
import { forgetTokenSettings, loadConfig, readEnvFile, repoEnvFile } from './config.ts';
import { startLan } from './lan.ts';
import { createSessionToken, removeRuntimeFile, writeRuntimeFile } from './runtime-file.ts';
import { trustSystemCertificates } from './system-certificates.ts';
import { tokenNotices } from './token-notices.ts';
import type { ParentPort } from './desktop-updates.ts';
import { updateHost } from './updates-host.ts';
import { serveWeb } from './web.ts';

const here = dirname(fileURLToPath(import.meta.url));
const packageJson = JSON.parse(readFileSync(join(here, '..', 'package.json'), 'utf8')) as { version: string };

const envFile = readEnvFile(repoEnvFile);
const config = loadConfig(envFile === undefined ? {} : { envFile: envFile.text });
forgetTokenSettings();
const token = createSessionToken();
const serveWebApp = process.argv.includes('--serve-web');
const distDir = join(here, '..', '..', 'web', 'dist');
trustSystemCertificates();

// The inbox's cache (spec 007). It opens before the server, so a reset is told once the log exists.
const cacheNotices: string[] = [];
const cache = openInboxCache(cacheFilePath(config.home), {
  onReset: () => {
    cacheNotices.push(
      `${cacheFilePath(config.home)} could not be read; Orynx made a new one and fills it on the next sync.`,
    );
  },
  onUnusable: () => {
    cacheNotices.push(
      `${cacheFilePath(config.home)} is not a file, so the inbox cache lives in memory until Orynx restarts. Move it away to keep the cache between runs.`,
    );
  },
});

// The Claude Code inside the Agent SDK, or the fake the e2e run names with DEVHUB_CLAUDE_CODE.
const claudeProgram = config.claudeCode ?? findSdkClaudeCode();
// Claude runs commands only inside Claude Code's sandbox (spec 012, Q2). The e2e run's fake has none.
const sandbox =
  config.sandbox === 'assume' ||
  (await sandboxAvailable({ platform: process.platform, searchPath: config.ghSearchPath }));

// The password other devices on the wifi ask for (spec 043): Set up Orynx saves it, the front door checks it.
const password = createPasswordStore(passwordFilePath(config.home));

// Settings › About (spec 045): the desktop app runs this hub as its utility process, which has a parent port.
// What it says before the server's log exists waits for it.
const updateNotices: string[] = [];
let logUpdate = (line: string): void => {
  updateNotices.push(line);
};
const updates = await updateHost({
  desktop: (process as NodeJS.Process & { parentPort?: ParentPort }).parentPort ?? null,
  service: config.service,
  version: packageJson.version,
  repo: join(here, '..', '..', '..'),
  home: config.home,
  env: config.terminalEnvironment,
  log: (line) => {
    logUpdate(line);
  },
});

const app = await createServer({
  token,
  port: config.port,
  version: packageJson.version,
  // Memory only when DEVHUB_KEYCHAIN=memory, which the e2e run sets.
  keychain: config.keychain === 'memory' ? createMemoryKeychain() : createOsKeychain(),
  // Empty unless the user turned on DEVHUB_TOKENS_FROM_ENV.
  envTokens: config.tokens.env,
  // gh from the PATH of the terminal that started DevHub. The e2e run puts a fake one first.
  gh: createGhCli({ searchPath: config.ghSearchPath }),
  // The computer's folder picker from that same PATH, for Choose folder (spec 020).
  folderPicker: createFolderPicker({ searchPath: config.ghSearchPath, platform: process.platform }),
  filePicker: createFilePicker({ searchPath: config.ghSearchPath, platform: process.platform }),
  // The Claude Code inside the Agent SDK, with only the allowed part of the shell's environment (spec 010).
  // The e2e run names a fake with DEVHUB_CLAUDE_CODE.
  claudeCode: createClaudeCode({
    program: claudeProgram,
    env: config.agentEnvironment,
    workFolder: claudeWorkFolder(config.home),
  }),
  // Sessions run that same Claude Code through the SDK, with the same environment (spec 011). With no
  // Claude Code for this computer, no session can start.
  ...(claudeProgram === null
    ? {}
    : { agent: { query, program: claudeProgram, env: config.agentEnvironment, sandbox } }),
  gitEnvironment: config.gitEnvironment,
  // Your shell tabs in a session's Terminal (spec 036); Windows has none, as it has no commands for Claude.
  ...(process.platform === 'win32' ? {} : { terminal: { env: config.terminalEnvironment } }),
  // Under DEVHUB_HOME/sessions, and the worktrees under DEVHUB_HOME/worktrees.
  sessions: await openFileSessionStore(config.home),
  // Orynx's own tickets, beside settings.json and out of the cache Clear cache wipes (spec 037).
  orynxTickets: createOrynxTicketStore({ path: join(config.home, 'tickets.json') }),
  // Settings › Repositories never adds DevHub's own folder (spec 005).
  dataDir: config.home,
  settings: createFileSettingsStore(config.home, {
    onUnreadable: () => {
      app.log.warn(
        `${settingsFilePath(config.home)} is not valid; Orynx keeps it beside the new one when settings next save.`,
      );
    },
    onKept: (kept) => {
      app.log.warn(`Orynx kept the settings it couldn't read as ${kept}.`);
    },
  }),
  cache,
  password,
  // Home's list syncs at start, every 2 minutes while a page is open, and when a tool connects.
  autoSync: true,
  // Checks GitHub's releases at start and every 6 hours; the e2e run names a fake with DEVHUB_RELEASES_URL.
  updates: { host: updates, ...(config.releasesUrl === null ? {} : { releasesUrl: config.releasesUrl }) },
  logger: {
    level: config.logLevel,
    ...(config.pretty ? { transport: { target: 'pino-pretty', options: { ignore: 'pid,hostname' } } } : {}),
  },
});

for (const notice of cacheNotices) app.log.warn(notice);
for (const notice of updateNotices) app.log.warn(notice);
logUpdate = (line) => {
  app.log.warn(line);
};
if (config.sandbox === 'assume') {
  app.log.warn('DEVHUB_SANDBOX=assume: Orynx gives Claude commands without checking that its sandbox can run.');
} else if (!sandbox) {
  app.log.warn(
    "Claude Code's sandbox can't run on this computer, so Claude runs no commands in a session. On Linux, install bubblewrap and socat.",
  );
}
if (config.claudeCode !== null) {
  app.log.warn(`DEVHUB_CLAUDE_CODE is set: Orynx checks the Claude login and runs sessions with ${config.claudeCode}.`);
}

if (serveWebApp) {
  await serveWeb(app, { distDir, token });
}

// 127.0.0.1 only: other machines on the network can never reach the hub.
await app.listen({ host: '127.0.0.1', port: config.port });
// The port the OS gave, which differs from config.port when that is 0.
const { port } = app.server.address() as AddressInfo;
await writeRuntimeFile(config.home, { port, token, pid: process.pid });

// DEVHUB_LAN (spec 040): the hub stays on 127.0.0.1; your wifi reaches it through a front door that wants your password.
if (config.lan && !serveWebApp)
  app.log.warn('DEVHUB_LAN works with "pnpm start" only, so your wifi can’t reach this run.');
const stopLan =
  config.lan && serveWebApp
    ? await startLan({
        home: config.home,
        password,
        distDir,
        hubPort: port,
        forward: (request, response) => {
          app.routing(request, response);
        },
        platform: process.platform,
        log: app.log,
      })
    : undefined;

for (const notice of tokenNotices(config.tokens, envFile)) app.log[notice.level](notice.message);
app.log.info(
  serveWebApp
    ? `Orynx is running at http://127.0.0.1:${String(port)}`
    : `Orynx server is ready on 127.0.0.1:${String(port)}. Open the web app that "pnpm dev" started.`,
);

let stopping = false;
async function stop(signal: string): Promise<void> {
  if (stopping) return;
  stopping = true;
  app.log.info(`${signal}: stopping Orynx`);
  await removeRuntimeFile(config.home);
  stopLan?.();
  await app.close();
  process.exit(0);
}
process.on('SIGINT', () => void stop('SIGINT'));
process.on('SIGTERM', () => void stop('SIGTERM'));
