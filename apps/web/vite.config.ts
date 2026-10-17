import { existsSync, readFileSync } from 'node:fs';
import { homedir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { parseEnv } from 'node:util';
import tailwindcss from '@tailwindcss/vite';
import react from '@vitejs/plugin-react';
import { defineConfig, type Plugin } from 'vite';

// The same settings the server reads (apps/server/src/config.ts): the shell first, then the
// repo-root .env. An empty value, like the blank lines in .env.example, counts as not set.
const repoEnvFile = fileURLToPath(new URL('../../.env', import.meta.url));
const fromFile = existsSync(repoEnvFile) ? parseEnv(readFileSync(repoEnvFile, 'utf8')) : {};
function setting(
  shell: string | undefined,
  key: 'DEVHUB_PORT' | 'DEVHUB_WEB_PORT' | 'DEVHUB_HOME',
): string | undefined {
  const value = shell === undefined || shell === '' ? fromFile[key] : shell;
  return value === '' ? undefined : value;
}

const serverPort = Number(setting(process.env['DEVHUB_PORT'], 'DEVHUB_PORT') ?? 4317);
const webPort = Number(setting(process.env['DEVHUB_WEB_PORT'], 'DEVHUB_WEB_PORT') ?? 4318);
const devhubHome = setting(process.env['DEVHUB_HOME'], 'DEVHUB_HOME') ?? join(homedir(), '.devhub');

/**
 * In `pnpm dev`, Vite serves index.html, so this plugin does what the server does in
 * production: put the per-start token from <DEVHUB_HOME>/runtime.json into the page.
 * It reads the file on every page load, so restarting the server needs only a reload.
 */
function devhubToken(): Plugin {
  return {
    name: 'devhub-token',
    apply: 'serve',
    transformIndexHtml(html) {
      let token = '';
      try {
        token = (JSON.parse(readFileSync(join(devhubHome, 'runtime.json'), 'utf8')) as { token?: string }).token ?? '';
      } catch {
        // The server is not running yet: the API answers 401 and the app asks to reload.
      }
      return html.replace('<meta name="devhub-token" content="" />', `<meta name="devhub-token" content="${token}" />`);
    },
  };
}

const proxy = {
  // changeOrigin sends Host: 127.0.0.1:<port>, which the server's host check accepts.
  '/api': { target: `http://127.0.0.1:${String(serverPort)}`, changeOrigin: true },
};

export default defineConfig({
  plugins: [react(), tailwindcss(), devhubToken()],
  server: { host: 'localhost', port: webPort, strictPort: true, proxy },
  preview: { host: 'localhost', port: webPort, strictPort: true, proxy },
  // DevHub is served from this laptop, so one ~550 kB bundle loads instantly; split by route when it grows.
  build: { outDir: 'dist', sourcemap: true, chunkSizeWarningLimit: 800 },
});
