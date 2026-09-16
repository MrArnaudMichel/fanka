import { fileURLToPath } from 'node:url';
import AutoImport from 'unplugin-auto-import/vite';
import { defineConfig } from 'vitest/config';

export default defineConfig({
  plugins: [AutoImport({ imports: ['vue'] })],
  test: {
    environment: 'happy-dom',
    include: ['test/**/*.test.ts'],
  },
  resolve: {
    // kanto is a symlinked `file:` dependency. Without this, Vite resolves it
    // to its realpath (dropping the `node_modules` segment), which makes
    // unplugin-auto-import's default node_modules exclude miss it and
    // instrument Kanto's compiled Lit components by mistake.
    preserveSymlinks: true,
    alias: {
      '~core': fileURLToPath(new URL('./core', import.meta.url)),
      '~': fileURLToPath(new URL('./app', import.meta.url)),
    },
  },
});
