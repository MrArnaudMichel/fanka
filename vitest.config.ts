import { fileURLToPath } from 'node:url';
import AutoImport from 'unplugin-auto-import/vite';
import type { Plugin } from 'vite';
import { defineConfig } from 'vitest/config';

/**
 * Nuxt's own Vite plugin statically replaces `import.meta.client`/`.server`
 * with a literal boolean at build time; that replacement never runs under
 * plain Vitest (no @nuxt/test-utils here), so the flag reads as `undefined`
 * in every test. That's fine for most modules, but it means a composable
 * like useSettings.ts, gated on `import.meta.client`, has its client-only
 * branch silently unreachable in tests. This stands in for Nuxt's own
 * dead-code-elimination step, so a test can exercise such a composable the
 * way it actually runs in the browser (ssr: false — everything under app/
 * only ever runs there).
 *
 * Matched by content, not by file path: a path-based check silently stops
 * applying — and the guarded branch it exists to test goes quietly
 * unreachable again — the moment the file is renamed or moved, which is
 * exactly the kind of drift a test suite should not depend on staying in
 * sync with by hand. Matching on the literal `import.meta.client` substring
 * instead means this keeps working for whichever file(s) actually use it,
 * wherever they live.
 */
function stubImportMetaClient(): Plugin {
  return {
    name: 'stub-import-meta-client',
    enforce: 'pre',
    transform(code) {
      if (!code.includes('import.meta.client')) return null;
      return code.replaceAll('import.meta.client', 'true');
    },
  };
}

export default defineConfig({
  plugins: [AutoImport({ imports: ['vue'] }), stubImportMetaClient()],
  test: {
    environment: 'happy-dom',
    include: ['test/**/*.test.ts'],
  },
  resolve: {
    alias: {
      '~core': fileURLToPath(new URL('./core', import.meta.url)),
      '~': fileURLToPath(new URL('./app', import.meta.url)),
    },
  },
});
