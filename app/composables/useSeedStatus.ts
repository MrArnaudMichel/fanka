const failed = ref(false);

/**
 * Shared between `seed.client.ts` and the Today page. Both a persistent seed
 * failure and a fresh, not-yet-seeded database show up on the page as zero
 * decks — this is the only way to tell them apart, since the page never
 * calls `seedIfNeeded` itself on a normal load.
 */
export function useSeedStatus() {
  return {
    failed: readonly(failed),
    markFailed(): void {
      failed.value = true;
    },
    clear(): void {
      failed.value = false;
    },
  };
}
