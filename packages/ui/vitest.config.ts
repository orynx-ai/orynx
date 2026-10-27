import react from '@vitejs/plugin-react';
import { defineProject } from 'vitest/config';

export default defineProject({
  plugins: [react()],
  test: {
    name: 'ui',
    environment: 'jsdom',
    include: ['src/**/*.test.{ts,tsx}'],
    setupFiles: ['./src/test/setup.ts'],
    // Each file shares its worker's modules: 24 s became 6 s, and three shuffled runs passed (spec 048).
    isolate: false,
    css: false,
    // The icon set is ~6,000 files behind one index; bundled once, each test file loads it fast instead of file by file.
    deps: { optimizer: { client: { enabled: true, include: ['@hugeicons/core-free-icons'] } } },
  },
});
