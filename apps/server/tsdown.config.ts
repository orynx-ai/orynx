import { defineConfig } from 'tsdown';

export default defineConfig({
  entry: ['src/main.ts'],
  platform: 'node',
  target: 'node22',
  format: 'esm',
  outDir: 'dist',
  clean: true,
  // Workspace packages are TypeScript source, so they are bundled in; npm packages stay external.
  noExternal: [/^@devhub\//],
});
