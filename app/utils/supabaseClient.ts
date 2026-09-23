import { createClient, type SupabaseClient } from '@supabase/supabase-js';
import { useRuntimeConfig } from 'nuxt/app';

let client: SupabaseClient | null = null;

/**
 * One Supabase client for the whole app, created lazily on first use — this
 * app is `ssr: false`, so this only ever runs client-side — and reused after.
 *
 * `persistSession`/`autoRefreshToken` (both defaults, spelled out here so the
 * choice is visible) keep the session in `localStorage`, which is exactly
 * what lets the Android WebView stay signed in across app launches — it is
 * the same origin/storage every time, unlike a normal mobile browser tab.
 *
 * `flowType: 'pkce'` (not the library default, `'implicit'`) is what makes
 * the magic-link redirect URL carry a `?code=` query param instead of tokens
 * in the URL fragment: `detectSessionInUrl` then exchanges that code for a
 * session automatically on the web build, and
 * `app/plugins/deep-link.client.ts` does the same by hand on Android, where
 * the redirect opens outside this client's `window.location` entirely.
 */
export function getSupabaseClient(): SupabaseClient {
  if (!client) {
    const config = useRuntimeConfig();
    // Nuxt's own generated types (`.nuxt/types`) know `public.supabaseUrl`/
    // `supabaseAnonKey` are strings from `nuxt.config.ts`'s `runtimeConfig`;
    // the plain `nuxt/app` import above does not carry that augmentation, so
    // it is spelled out here instead of left as `unknown`.
    const supabaseUrl = config.public.supabaseUrl as string;
    const supabaseAnonKey = config.public.supabaseAnonKey as string;
    client = createClient(supabaseUrl, supabaseAnonKey, {
      auth: {
        persistSession: true,
        autoRefreshToken: true,
        detectSessionInUrl: true,
        flowType: 'pkce',
      },
    });
  }
  return client;
}
