import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { query } from '@anthropic-ai/claude-agent-sdk';
import {
  cacheFilePath,
  claudeWorkFolder,
  createClaudeCode,
  createFileSettingsStore,
  createGhCli,
  createMemoryKeychain,
  createOsKeychain,
  createServer,
  findSdkClaudeCode,
  openFileSessionStore,
  openInboxCache,
  sandboxAvailable,
  settingsFilePath,
} from '@devhub/core';
import { forgetTokenSettings, loadConfig, readEnvFile, repoEnvFile } from './config.ts';
import { createSessionToken, removeRuntimeFile, writeRuntimeFile } from './runtime-file.ts';
import { trustSystemCertificates } from './system-certificates.ts';
import { tokenNotices } from './token-notices.ts';
import { serveWeb } from './web.ts';

const here = dirname(fileURLToPath(import.meta.url));
const packageJson = JSON.parse(readFileSync(join(here, '..', 'package.json'), 'utf8')) as { version: string };

const envFile = readEnvFile(repoEnvFile);
const config = loadConfig(envFile === undefined ? {} : { envFile: envFile.text });
forgetTokenSettings();
const token = createSessionToken();
const serveWebApp = process.argv.includes('--serve-web');
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
  // Under DEVHUB_HOME/sessions, and the worktrees under DEVHUB_HOME/worktrees.
  sessions: await openFileSessionStore(config.home),
  // Settings › Repositories never adds DevHub's own folder (spec 005).
  dataDir: config.home,
  settings: createFileSettingsStore(config.home, {
    onUnreadable: () => {
      app.log.warn(`${settingsFilePath(config.home)} is not valid; Orynx ignores it until the next save.`);
    },
  }),
  cache,
  // Home's list syncs at start, every 2 minutes while a page is open, and when a tool connects.
  autoSync: true,
  logger: {
    level: config.logLevel,
    ...(config.pretty ? { transport: { target: 'pino-pretty', options: { ignore: 'pid,hostname' } } } : {}),
  },
});

for (const notice of cacheNotices) app.log.warn(notice);
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
  await serveWeb(app, { distDir: join(here, '..', '..', 'web', 'dist'), token });
}

// 127.0.0.1 only: other machines on the network can never reach the hub.
await app.listen({ host: '127.0.0.1', port: config.port });
await writeRuntimeFile(config.home, { port: config.port, token, pid: process.pid });

for (const notice of tokenNotices(config.tokens, envFile)) app.log[notice.level](notice.message);
app.log.info(
  serveWebApp
    ? `Orynx is running at http://127.0.0.1:${String(config.port)}`
    : `Orynx server is ready on 127.0.0.1:${String(config.port)}. Open the web app that "pnpm dev" started.`,
);

let stopping = false;
async function stop(signal: string): Promise<void> {
  if (stopping) return;
  stopping = true;
  app.log.info(`${signal}: stopping Orynx`);
  await removeRuntimeFile(config.home);
  await app.close();
  process.exit(0);
}
process.on('SIGINT', () => void stop('SIGINT'));
process.on('SIGTERM', () => void stop('SIGTERM'));
