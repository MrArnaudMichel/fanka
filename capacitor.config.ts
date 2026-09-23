import type { CapacitorConfig } from '@capacitor/cli';

// The app is a static, client-only bundle (see nuxt.config.ts's `ssr: false`)
// backed by Dexie/IndexedDB, so it runs entirely offline from the assets
// bundled into the APK. No `server.url` — never load the app over the
// network from a dev machine.
const config: CapacitorConfig = {
  appId: 'fr.arnaudmichel.fanka',
  appName: 'Fanka',
  webDir: '.output/public',
  android: {},
};

export default config;
