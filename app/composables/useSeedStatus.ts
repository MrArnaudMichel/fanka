import { seedIfNeeded } from '~core/seed/seed';

const failed = ref(false);
const retrying = ref(false);

// Overlapping retries are serialised through this chain — the convention
// `useReviewSession` already uses for its own actions — rather than the
// later one being dropped. `attempt` never rejects, so the chain never
// stalls on a failure.
let pending = 0;
let chain: Promise<unknown> = Promise.resolve();

async function attempt(now: number): Promise<boolean> {
  try {
    await seedIfNeeded(now);
    failed.value = false;
    return true;
  } catch (err) {
    console.error('useSeedStatus: retry failed', err);
    failed.value = true;
    return false;
  }
}

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
     * A call made while another is still running waits for it, then runs
     * its own attempt — by then a single settings read if the first one
     * succeeded — so two `seedIfNeeded` calls never overlap, and nothing is
     * dropped. That keeps the result unambiguous: `true` means the seed is
     * in place and it is safe to reload what depends on it, `false` means
     * this call's attempt failed. (An earlier version returned `false` for
     * "another retry is in flight" too, indistinguishable from a failure.)
     */
    retry(now = Date.now()): Promise<boolean> {
      pending += 1;
      retrying.value = true;
      const run = chain.then(() => attempt(now));
      chain = run;
      void run.finally(() => {
        pending -= 1;
        if (pending === 0) retrying.value = false;
      });
      return run;
    },
  };
}
