import react from '@vitejs/plugin-react';
import { defineProject } from 'vitest/config';

export default defineProject({
  plugins: [react()],
  test: {
    name: 'app',
    environment: 'jsdom',
    // Same origin as production (the hub serves the page), so requests are same-origin like the real app.
    environmentOptions: { jsdom: { url: 'http://127.0.0.1:4317/' } },
    include: ['src/**/*.test.{ts,tsx}'],
    setupFiles: ['./src/test/setup.ts'],
    // Each file shares its worker's modules: importing them again per file was half the run (spec 048, AC-21).
    // setup.ts resets the stores, MSW and the DOM after every test, so nothing one file leaves reaches the next.
    isolate: false,
    css: false,
    // The icon set is ~6,000 files behind one index; bundled once, each test file loads it fast instead of file by file.
    deps: { optimizer: { client: { enabled: true, include: ['@hugeicons/core-free-icons'] } } },
  },
});
