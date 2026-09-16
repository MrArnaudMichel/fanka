import { fileURLToPath } from 'node:url';
import { isKantoElement } from 'kanto/vue';

export default defineNuxtConfig({
  compatibilityDate: '2026-09-16',
  // Kanto elements need a DOM at definition time. Under SSR they render
  // unstyled-but-present until the bundle lands; disabling SSR removes that
  // flash entirely. Nitro still serves /server/api.
  ssr: false,
  devtools: { enabled: true },
  css: ['kanto/styles.css', '~/assets/css/fanka.css'],
  vue: {
    compilerOptions: { isCustomElement: isKantoElement },
  },
  typescript: { strict: true, typeCheck: false },
  alias: { '~core': fileURLToPath(new URL('./core', import.meta.url)) },
  // Kanto is consumed as a sibling `file:` dependency, not a workspace
  // member, so Vite's dev server otherwise refuses to serve its font files
  // (they sit outside the project root) and every Kanto element falls back
  // to a system font.
  vite: { server: { fs: { allow: [fileURLToPath(new URL('../kanto', import.meta.url))] } } },
});
