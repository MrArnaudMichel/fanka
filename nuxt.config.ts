import { execSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { isKantoElement } from 'kanto-ds/vue';

const pkg = JSON.parse(readFileSync(new URL('./package.json', import.meta.url), 'utf-8')) as { version: string };

/** The short commit the bundle is built from, for Settings › About; empty outside a git checkout. */
function gitCommit(): string {
  try {
    return execSync('git rev-parse --short HEAD').toString().trim();
  } catch {
    return '';
  }
}

export default defineNuxtConfig({
  compatibilityDate: '2026-09-16',
  // Dev-only "install the debug APK on a phone" page and routes — see
  // modules/dev-install.ts, a no-op outside `npm run dev`.
  modules: ['./modules/dev-install'],
  // Kanto elements need a DOM at definition time. Under SSR they render
  // unstyled-but-present until the bundle lands; disabling SSR removes that
  // flash entirely. Nitro still serves /server/api.
  ssr: false,
  devtools: { enabled: true },
  // `viewport-fit=cover` lets the WebView report `env(safe-area-inset-*)`
  // under Android's edge-to-edge layout (enforced from Android 15/targetSdk
  // 35+), which the layout uses to keep the header clear of the status bar.
  app: { head: { viewport: 'width=device-width, initial-scale=1, viewport-fit=cover' } },
  // Baked in at build time: `ssr: false` means there is no request-time
  // server to inject these, so `npm run dev`/`npm run build:app` both read
  // them from `.env` (`.env.example` documents the two keys), and an Android
  // release build needs them set in the shell/CI environment beforehand.
  // Both are safe in a client bundle — the publishable key only grants what
  // row-level security (`supabase/migrations/0001_init.sql`) allows.
  runtimeConfig: {
    public: {
      supabaseUrl: '',
      supabaseAnonKey: '',
      appVersion: pkg.version,
      appCommit: gitCommit(),
      appBuiltAt: String(Date.now()),
    },
  },
  css: ['kanto-ds/styles.css', '~/assets/css/fanka.css'],
  vue: {
    compilerOptions: { isCustomElement: isKantoElement },
  },
  typescript: { strict: true, typeCheck: false },
  alias: { '~core': fileURLToPath(new URL('./core', import.meta.url)) },
});
