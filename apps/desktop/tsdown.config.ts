import { defineConfig } from 'tsdown';

export default defineConfig({
  entry: ['src/main.ts'],
  platform: 'node',
  target: 'node24',
  // CommonJS: electron-updater calls require('electron'), which an ES module bundle can't keep.
  format: 'cjs',
  outDir: 'dist',
  clean: true,
  // Everything is bundled into main.cjs, so the app ships no node_modules of its own. Electron provides itself.
  deps: { neverBundle: ['electron'], alwaysBundle: [/^(?!electron$)/], onlyBundle: false },
});
