import { defineConfig } from 'tsdown';

export default defineConfig({
  entry: ['src/main.ts'],
  platform: 'node',
  target: 'node24',
  format: 'esm',
  outDir: 'dist',
  clean: true,
  // Everything is bundled into main.mjs, so the app ships no node_modules of its own. Electron provides itself.
  external: ['electron'],
  noExternal: [/^(?!electron$)/],
});
