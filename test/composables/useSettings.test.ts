import { describe, expect, it, vi } from 'vitest';
import { DEFAULT_SETTINGS, type Settings } from '~core/db/settings';

// A deferred we control by hand, so the initial load's resolution timing is
// deterministic instead of relying on real delays or setTimeout races.
const { deferredLoad, loadSettings } = vi.hoisted(() => {
  let resolve!: (value: unknown) => void;
  const promise = new Promise((res) => {
    resolve = res;
  });
  return { deferredLoad: { promise, resolve }, loadSettings: vi.fn(() => promise) };
});

vi.mock('~core/db/settings', async (importOriginal) => {
  const actual = await importOriginal<typeof import('~core/db/settings')>();
  return {
    ...actual,
    // The composable's initial load hangs on this until the test resolves it.
    loadSettings,
    // update() always sees a fast, uncontested write.
    saveSettings: vi.fn(async (patch: Partial<Settings>) => ({ ...actual.DEFAULT_SETTINGS, ...patch })),
  };
});

describe('useSettings — initial load vs. a concurrent update', () => {
  it('keeps a patch applied while the initial load is still in flight', async () => {
    const { useSettings } = await import('~/composables/useSettings');
    const { settings, update } = useSettings(); // starts the (still-pending) initial load

    // Guards this test against the vitest.config.ts `import.meta.client`
    // stub silently stopping (e.g. the composable no longer matches its
    // content check): if the initial load never actually started, the rest
    // of this test would pass vacuously without ever exercising `await
    // loading` in update().
    expect(loadSettings).toHaveBeenCalledTimes(1);

    // Nothing stops a caller from patching before the initial load settles.
    const updatePromise = update({ newPerDay: 42 });

    // Let update()'s own microtasks (including, once fixed, its wait on the
    // initial load) run before the slow load resolves.
    await Promise.resolve();
    await Promise.resolve();

    // The slow initial read finally comes back with the (unpatched) defaults.
    deferredLoad.resolve({ ...DEFAULT_SETTINGS });
    await updatePromise;

    // The patch must win: the initial load resolving afterwards must not
    // revert settings.value to the stale, pre-patch snapshot it captured.
    expect(settings.value.newPerDay).toBe(42);
  });
});
