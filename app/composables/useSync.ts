import { type SyncDetails, readSyncDetails } from '~core/db/sync-details';
import { runSync } from '~core/sync';
import { createSupabaseTransport } from '~core/sync/supabase';
import { clearFollowed, followedUser, markFollowed } from '~core/db/bundle-follow';
import { lessonProgress } from '~core/db/repositories';
import { useAuth } from '~/composables/useAuth';
import { useSettings } from '~/composables/useSettings';
import { getSupabaseClient } from '~/utils/supabaseClient';

export type SyncStatus = 'idle' | 'syncing' | 'error' | 'offline';

const status = ref<SyncStatus>('idle');
const lastSyncedAt = ref<number | null>(null);
const error = ref('');
const details = ref<SyncDetails | null>(null);

/** Never throws: Account keeps the last counts it had. */
async function refreshDetails(): Promise<void> {
  try {
    details.value = await readSyncDetails();
  } catch (err) {
    console.error('useSync: could not read sync details', err);
  }
}

let runningPromise: Promise<void> | null = null;
let rerunRequested = false;
let debounceHandle: ReturnType<typeof setTimeout> | null = null;

/** A burst of outbox writes collapses into one run, this long after the last one. */
const WRITE_DEBOUNCE_MS = 800;

/** A transport for the signed-in user, or null when nobody is — nothing to sync against, which is not an error (sync is optional). */
function currentTransport() {
  const { user } = useAuth();
  if (!user.value) return null;
  return createSupabaseTransport(getSupabaseClient(), user.value.id);
}

/**
 * After the first pull following a sign-in: an account with lesson progress
 * in exactly one bundle studies that one, so a device set up for the other
 * switches to it (and counts as onboarded). Progress in both, or in neither,
 * leaves the choice alone. The account is remembered on the device, so a
 * restored session after a restart is not taken for a sign-in and does not undo
 * a bundle the learner switched to on purpose.
 */
async function followStudiedBundle(): Promise<void> {
  try {
    const bundles = await lessonProgress.bundles();
    if (bundles.length !== 1) return;
    const { settings, update } = useSettings();
    const patch: { bundle?: typeof bundles[number]; onboardedAt?: number } = {};
    if (settings.value.bundle !== bundles[0]) patch.bundle = bundles[0];
    if (settings.value.onboardedAt === null) patch.onboardedAt = Date.now();
    if (Object.keys(patch).length > 0) await update(patch);
  } catch (err) {
    console.error('useSync: could not follow the studied bundle', err);
  }
}

async function runOnce(): Promise<void> {
  const transport = currentTransport();
  if (!transport) {
    status.value = 'idle';
    return;
  }
  if (typeof navigator !== 'undefined' && navigator.onLine === false) {
    status.value = 'offline';
    return;
  }
  status.value = 'syncing';
  try {
    await runSync(transport);
    const userId = useAuth().user.value?.id ?? null;
    if (userId && userId !== (await followedUser())) {
      await markFollowed(userId);
      await followStudiedBundle();
    }
    lastSyncedAt.value = Date.now();
    status.value = 'idle';
    error.value = '';
  } catch (err) {
    // Never thrown further: a failed sync only ever changes `status`/`error`,
    // per the brief — the outbox itself is left untouched by `runSync` on a
    // failed push, so the next run (foreground, the next write, "Sync now")
    // resends exactly what was missed. Nothing here can crash a page.
    console.error('useSync: sync failed', err);
    status.value = 'error';
    error.value = err instanceof Error ? err.message : 'Sync failed';
  }
}

/**
 * Never runs two syncs at once. A call made while one is already in flight
 * joins that same run instead of starting a second, and marks that one more
 * run is owed once it settles — so a write that landed mid-sync (too late
 * for that run's outbox snapshot) is never left stranded until the next
 * unrelated trigger happens to come along.
 */
function runExclusive(): Promise<void> {
  if (runningPromise) {
    rerunRequested = true;
    return runningPromise;
  }
  runningPromise = runOnce().finally(() => {
    void refreshDetails();
    runningPromise = null;
    if (rerunRequested) {
      rerunRequested = false;
      void runExclusive();
    }
  });
  return runningPromise;
}

function clearDebounce(): void {
  if (debounceHandle !== null) {
    clearTimeout(debounceHandle);
    debounceHandle = null;
  }
}

/**
 * Sync scheduling for the whole app, shared through the same module-scope
 * singleton pattern as `useSettings`/`useSeedStatus`.
 * `app/plugins/sync.client.ts` wires `triggerSync`/`notifyWrite` into
 * sign-in, app start, foreground and every local write; Settings' Account
 * section calls `syncNow()` for its button and reads `status`/`lastSyncedAt`/
 * `error` to show the result.
 */
export function useSync() {
  return {
    status: readonly(status),
    lastSyncedAt: readonly(lastSyncedAt),
    error: readonly(error),
    details: readonly(details),
    refreshDetails,
    /** Runs immediately, cancelling any pending debounce — for sign-in, app start and returning to the foreground. */
    triggerSync(): Promise<void> {
      clearDebounce();
      return runExclusive();
    },
    /** Forgets whose bundle was followed, so the next sign-in follows again. */
    async signedOut(): Promise<void> {
      try {
        await clearFollowed();
      } catch (err) {
        console.error('useSync: could not clear the followed account', err);
      }
    },
    /** Debounced: several outbox writes in quick succession schedule only one run. */
    notifyWrite(): void {
      clearDebounce();
      debounceHandle = setTimeout(() => {
        debounceHandle = null;
        void runExclusive();
      }, WRITE_DEBOUNCE_MS);
    },
    /** The Account section's "Sync now" button: same as `triggerSync`, named for what it is at the call site. */
    syncNow(): Promise<void> {
      clearDebounce();
      return runExclusive();
    },
  };
}
