import { App } from '@capacitor/app';
import { Capacitor } from '@capacitor/core';
import { useAuth } from '~/composables/useAuth';

/**
 * Android only. A magic-link email opens in the OS browser, not this app's
 * WebView, so Supabase's own `detectSessionInUrl` (which only ever looks at
 * `window.location`) never sees the redirect. The `fanka://auth` intent
 * filter (`android/app/src/main/AndroidManifest.xml`) instead relaunches
 * Fanka with that URL, and this listener hands it to
 * `useAuth().completeSignInFromUrl`, which exchanges its `code` for a
 * session in this same WebView.
 */
export default defineNuxtPlugin(() => {
  if (!Capacitor.isNativePlatform()) return;
  const { completeSignInFromUrl } = useAuth();
  void App.addListener('appUrlOpen', (event) => {
    if (!event.url.startsWith('fanka://auth')) return;
    void completeSignInFromUrl(event.url);
  });
});
