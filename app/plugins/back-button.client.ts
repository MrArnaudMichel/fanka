import { App } from '@capacitor/app';
import { Capacitor } from '@capacitor/core';

/**
 * Android's hardware/gesture Back button. Capacitor's WebView otherwise has
 * no history of its own to fall back to, so without this listener Back does
 * nothing on Android (there's no browser chrome to fall back to either).
 *
 * Any route other than the root (`/`, the Today page) goes back one step in
 * the app; the root is where Back exits, same as a normal Android app.
 * Native-only: the listener is a no-op in the browser (`npm run dev`), and
 * `App.exitApp()` would throw there.
 */
export default defineNuxtPlugin(() => {
  if (!Capacitor.isNativePlatform()) return;

  const router = useRouter();

  App.addListener('backButton', () => {
    if (router.currentRoute.value.path === '/') {
      App.exitApp();
    } else {
      router.back();
    }
  });
});
