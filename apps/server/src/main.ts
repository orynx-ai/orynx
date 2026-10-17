import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  createFileSettingsStore,
  createGhCli,
  createMemoryKeychain,
  createOsKeychain,
  createServer,
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
  // Settings › Repositories never adds DevHub's own folder (spec 005).
  dataDir: config.home,
  settings: createFileSettingsStore(config.home, {
    onUnreadable: () => {
      app.log.warn(`${settingsFilePath(config.home)} is not valid; DevHub ignores it until the next save.`);
    },
  }),
  logger: {
    level: config.logLevel,
    ...(config.pretty ? { transport: { target: 'pino-pretty', options: { ignore: 'pid,hostname' } } } : {}),
  },
});

if (serveWebApp) {
  await serveWeb(app, { distDir: join(here, '..', '..', 'web', 'dist'), token });
}

// 127.0.0.1 only: other machines on the network can never reach the hub.
await app.listen({ host: '127.0.0.1', port: config.port });
await writeRuntimeFile(config.home, { port: config.port, token, pid: process.pid });

for (const notice of tokenNotices(config.tokens, envFile)) app.log[notice.level](notice.message);
app.log.info(
  serveWebApp
    ? `DevHub is running at http://127.0.0.1:${String(config.port)}`
    : `DevHub server is ready on 127.0.0.1:${String(config.port)}. Open the web app that "pnpm dev" started.`,
);

let stopping = false;
async function stop(signal: string): Promise<void> {
  if (stopping) return;
  stopping = true;
  app.log.info(`${signal}: stopping DevHub`);
  await removeRuntimeFile(config.home);
  await app.close();
  process.exit(0);
}
process.on('SIGINT', () => void stop('SIGINT'));
process.on('SIGTERM', () => void stop('SIGTERM'));
