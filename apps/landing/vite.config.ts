import { resolve } from 'node:path';
import { defineConfig } from 'vite';

// Two static pages: the landing page and the user guide at /docs/.
export default defineConfig({
  build: {
    rolldownOptions: {
      input: {
        main: resolve(import.meta.dirname, 'index.html'),
        docs: resolve(import.meta.dirname, 'docs/index.html'),
      },
    },
  },
});
