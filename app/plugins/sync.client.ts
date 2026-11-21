import { App } from '@capacitor/app';
import { Capacitor } from '@capacitor/core';
import { db } from '~core/db/db';
import { useAuth } from '~/composables/useAuth';
import { useSync } from '~/composables/useSync';

/**
 * Wires `useSync()`'s scheduling into the app: a run on sign-in and at app
 * start when already signed in (both are the same `user` transition, null →
 * a user — `getSession()` resolving to an existing session looks identical
 * to a fresh sign-in from here, and is handled the same way), on returning
 * to the foreground, and after every local write via Dexie's own `creating`
 * hook on the outbox table — `core/db/repositories.ts` writes an outbox row
 * inside the same transaction as every deck/card/item/review change, signed
 * in or not, so this fires for exactly those writes without any page or
 * composable needing to know sync exists.
 *
 * Nothing here is awaited or rethrown: a failed sync only ever changes
 * `useSync().status`, so it can never fail app startup or crash a page.
 */
export default defineNuxtPlugin(() => {
  const { user } = useAuth();
  const { triggerSync, notifyWrite, signedOut } = useSync();

  db.outbox.hook('creating', () => {
    notifyWrite();
  });

  if (typeof document !== 'undefined') {
    document.addEventListener('visibilitychange', () => {
      if (document.visibilityState === 'visible') void triggerSync();
    });
  }

  if (Capacitor.isNativePlatform()) {
    void App.addListener('appStateChange', (state) => {
      if (state.isActive) void triggerSync();
    });
  }

  watch(user, (next, prev) => {
    if (next && !prev) void triggerSync();
    if (!next && prev) void signedOut();
  });
});
