import { Capacitor } from '@capacitor/core';
import type { AuthUser } from '@supabase/supabase-js';
import { getSupabaseClient } from '~/utils/supabaseClient';

const user = ref<AuthUser | null>(null);
const loading = ref(true);
const error = ref('');

let initPromise: Promise<void> | null = null;

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

/**
 * Where the magic link redirects back to. On Android it is the
 * `fanka://auth` deep link (`android/app/src/main/AndroidManifest.xml`'s
 * intent filter, handled by `app/plugins/deep-link.client.ts`); everywhere
 * else — `npm run dev`, the Vercel build — it is the page's own origin,
 * which `getSupabaseClient()`'s `detectSessionInUrl` picks up on load.
 */
function redirectTarget(): string {
  if (Capacitor.isNativePlatform()) return 'fanka://auth';
  return typeof window === 'undefined' ? '' : window.location.origin;
}

/**
 * Registers the auth-state listener before the first `getSession()` read
 * settles (Supabase's own recommended order), so an event that lands during
 * that first read — e.g. an immediate token refresh — is never missed.
 * Runs once per app load; every `useAuth()` call after the first shares this
 * same promise and listener, the same singleton pattern as
 * `useSettings`/`useSeedStatus`.
 */
function ensureInitialized(): Promise<void> {
  if (initPromise) return initPromise;
  const client = getSupabaseClient();
  client.auth.onAuthStateChange((_event, session) => {
    user.value = session?.user ?? null;
  });
  initPromise = client.auth
    .getSession()
    .then(({ data, error: sessionError }) => {
      if (sessionError) console.error('useAuth: failed to read the initial session', sessionError);
      user.value = data.session?.user ?? null;
    })
    .catch((err: unknown) => {
      console.error('useAuth: failed to read the initial session', err);
    })
    .finally(() => {
      loading.value = false;
    });
  return initPromise;
}

/**
 * Sign-in state for the whole app, shared through the same module-scope
 * singleton pattern as `useSettings`/`useSeedStatus`. Sync is optional — the
 * app works fully offline while `user` is null — so `signIn`/`signOut`/the
 * deep-link exchange never throw: every failure lands in `error` instead, for
 * a page to show without its own try/catch.
 */
export function useAuth() {
  if (import.meta.client) void ensureInitialized();

  async function signIn(email: string): Promise<void> {
    error.value = '';
    const trimmed = email.trim();
    if (!EMAIL_RE.test(trimmed)) {
      error.value = 'Enter a valid email address.';
      return;
    }
    loading.value = true;
    try {
      const client = getSupabaseClient();
      const { error: signInError } = await client.auth.signInWithOtp({
        email: trimmed,
        options: { emailRedirectTo: redirectTarget() },
      });
      if (signInError) error.value = signInError.message;
    } catch (err) {
      console.error('useAuth: sign-in failed', err);
      error.value = err instanceof Error ? err.message : 'Sign-in failed';
    } finally {
      loading.value = false;
    }
  }

  /** Clears the Supabase session only — local decks/cards/reviews are untouched, so signing out never loses data. */
  async function signOut(): Promise<void> {
    error.value = '';
    try {
      const client = getSupabaseClient();
      const { error: signOutError } = await client.auth.signOut();
      if (signOutError) error.value = signOutError.message;
    } catch (err) {
      console.error('useAuth: sign-out failed', err);
      error.value = err instanceof Error ? err.message : 'Sign-out failed';
    }
  }

  /**
   * Android only: hands the `code` query param from the `fanka://auth` deep
   * link to Supabase, which exchanges it for a session using the PKCE
   * verifier this same WebView stored when `signIn()` requested the link —
   * see `app/plugins/deep-link.client.ts`, the only caller.
   */
  async function completeSignInFromUrl(url: string): Promise<void> {
    try {
      const code = new URL(url).searchParams.get('code');
      if (!code) return;
      const client = getSupabaseClient();
      const { error: exchangeError } = await client.auth.exchangeCodeForSession(code);
      if (exchangeError) error.value = exchangeError.message;
    } catch (err) {
      console.error('useAuth: failed to complete sign-in from the deep link', err);
      error.value = err instanceof Error ? err.message : 'Sign-in failed';
    }
  }

  return {
    user: readonly(user),
    loading: readonly(loading),
    error: readonly(error),
    signIn,
    signOut,
    completeSignInFromUrl,
  };
}
