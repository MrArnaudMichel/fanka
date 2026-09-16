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
});
