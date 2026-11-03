import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import tailwindcss from '@tailwindcss/vite';
import react from '@vitejs/plugin-react';
import { defineConfig, type Plugin } from 'vite';

/** MSW's own service worker, served next to the page, so it always matches the installed msw. */
function mockServiceWorker(): Plugin {
  const worker = () => readFileSync(createRequire(import.meta.url).resolve('msw/mockServiceWorker.js'));
  return {
    name: 'mock-service-worker',
    configureServer(server) {
      server.middlewares.use('/mockServiceWorker.js', (_req, res) => {
        res.setHeader('Content-Type', 'text/javascript');
        res.end(worker());
      });
    },
    generateBundle() {
      this.emitFile({ type: 'asset', fileName: 'mockServiceWorker.js', source: worker() });
    },
  };
}

export default defineConfig({
  plugins: [react(), tailwindcss(), mockServiceWorker()],
  // Relative paths, so the build runs from any folder, such as a Next.js site's public/demo/.
  base: './',
  server: { host: 'localhost', port: 4320, strictPort: true },
  preview: { host: 'localhost', port: 4320, strictPort: true },
  // The whole app and its fake hub in one bundle (~580 kB gzipped), loaded once per visit.
  build: { outDir: 'dist', chunkSizeWarningLimit: 2000 },
});
