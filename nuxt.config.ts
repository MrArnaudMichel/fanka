import { fileURLToPath } from 'node:url';
import { isKantoElement } from 'kanto/vue';

export default defineNuxtConfig({
  compatibilityDate: '2026-09-16',
  // Kanto elements need a DOM at definition time. Under SSR they render
  // unstyled-but-present until the bundle lands; disabling SSR removes that
  // flash entirely. Nitro still serves /server/api.
  ssr: false,
  devtools: { enabled: true },
  // `viewport-fit=cover` lets the WebView report `env(safe-area-inset-*)`
  // under Android's edge-to-edge layout (enforced from Android 15/targetSdk
  // 35+), which the layout uses to keep the header clear of the status bar.
  app: { head: { viewport: 'width=device-width, initial-scale=1, viewport-fit=cover' } },
  css: ['kanto/styles.css', '~/assets/css/fanka.css'],
  vue: {
    compilerOptions: { isCustomElement: isKantoElement },
  },
  typescript: { strict: true, typeCheck: false },
  alias: { '~core': fileURLToPath(new URL('./core', import.meta.url)) },
  // Kanto is consumed as a sibling `file:` dependency, not a workspace
  // member, so Vite's dev server otherwise refuses to serve its font files
  // (they sit outside the project root) and every Kanto element falls back
  // to a system font. Only `dist` is ever requested, so only `dist` is
  // opened — not `src`, `node_modules` or `.git` alongside it.
  vite: { server: { fs: { allow: [fileURLToPath(new URL('../kanto/dist', import.meta.url))] } } },
});
