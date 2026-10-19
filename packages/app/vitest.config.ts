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
    css: false,
    // The icon set is ~6,000 files behind one index; bundled once, each test file loads it fast instead of file by file.
    deps: { optimizer: { client: { enabled: true, include: ['@hugeicons/core-free-icons'] } } },
  },
});
