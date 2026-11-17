import { defineConfig } from 'tsup';

// Bundles the server (and the shared package's source) into dist/.
// Runtime dependencies stay external and are installed in the image.
export default defineConfig({
  entry: ['src/index.ts', 'src/db/migrate.ts'],
  format: 'esm',
  target: 'node24',
  platform: 'node',
  outDir: 'dist',
  clean: true,
  sourcemap: true,
  noExternal: ['@inventory/shared'],
});
