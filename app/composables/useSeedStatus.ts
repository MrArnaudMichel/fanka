import { seedIfNeeded } from '~core/seed/seed';

const failed = ref(false);
const retrying = ref(false);

/**
 * Shared between `seed.client.ts` and the Today page. Both a persistent seed
 * failure and a fresh, not-yet-seeded database show up on the page as zero
 * decks — this is the only way to tell them apart, since the page never
 * calls `seedIfNeeded` itself on a normal load.
 *
 * `retry` also lives here rather than in the page: pages never touch a
 * scheduler or the database directly (see `CLAUDE.md`), and `seedIfNeeded`
 * is exactly that.
 */
export function useSeedStatus() {
  return {
    failed: readonly(failed),
    retrying: readonly(retrying),
    markFailed(): void {
      failed.value = true;
    },
    clear(): void {
      failed.value = false;
    },
    /**
     * Re-runs the seed. Seeding is idempotent and never wrote `seedVersion`
     * on a failed attempt, so this redoes exactly the missing work rather
     * than being a no-op.
     *
     * `retrying` guards against an overlapping call rather than the caller
     * having to: the Retry button that drives this has no `loadingDecks`-style
     * flag of its own to swap itself out on the first click, so without this
     * guard a fast double click could start two `seedIfNeeded` calls at
     * once. Harmless (idempotent), but pointless — and worth closing anyway.
     *
     * Returns whether the retry succeeded, so the caller knows whether it is
     * safe to reload the data that depends on it.
     */
    async retry(now = Date.now()): Promise<boolean> {
      if (retrying.value) return false;
      retrying.value = true;
      try {
        await seedIfNeeded(now);
        failed.value = false;
        return true;
      } catch (err) {
        console.error('useSeedStatus: retry failed', err);
        failed.value = true;
        return false;
      } finally {
        retrying.value = false;
      }
    },
  };
}
