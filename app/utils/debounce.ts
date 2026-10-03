/**
 * Collapses a burst of requests into one call, `ms` after the last of them.
 * `flush()` runs a pending call at once — for a moment that cannot wait, such
 * as the app going to the background.
 */
export function debounced(run: () => void, ms: number): { request(): void; flush(): boolean } {
  let handle: ReturnType<typeof setTimeout> | null = null;

  /** Runs a pending call now; true when there was one. */
  function flush(): boolean {
    if (handle === null) return false;
    clearTimeout(handle);
    handle = null;
    run();
    return true;
  }

  return {
    request() {
      if (handle !== null) clearTimeout(handle);
      handle = setTimeout(flush, ms);
    },
    flush,
  };
}
