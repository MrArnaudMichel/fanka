import { afterEach, describe, expect, it, vi } from 'vitest';

/**
 * Each call to the mocked `runSync` hangs until the test settles it by hand,
 * and the mock records how many calls were in flight at once — same
 * convention as `test/composables/useSeedStatus.test.ts`'s `seedIfNeeded`
 * fake.
 */
const { calls, runSync } = vi.hoisted(() => {
  const calls: { resolve: () => void; reject: (err: Error) => void }[] = [];
  let inFlight = 0;
  const state = { maxInFlight: 0 };
  const runSync = vi.fn(
    () =>
      new Promise((resolve, reject) => {
        inFlight += 1;
        state.maxInFlight = Math.max(state.maxInFlight, inFlight);
        const done = () => {
          inFlight -= 1;
        };
        calls.push({
          resolve: () => {
            done();
            resolve({
              pushed: { decks: 0, cards: 0, items: 0, reviews: 0, attempts: 0, lessonProgress: 0 },
              pulled: { decks: 0, cards: 0, items: 0, reviews: 0, attempts: 0, lessonProgress: 0 },
            });
          },
          reject: (err: Error) => {
            done();
            reject(err);
          },
        });
      }),
  );
  return { calls: Object.assign(calls, { state }), runSync };
});

/** A signed-in-or-not `user` ref, shared with the mocked `useAuth`. */
const { userRef } = vi.hoisted(() => ({ userRef: { value: { id: 'user-1' } as { id: string } | null } }));

const { readSyncDetails } = vi.hoisted(() => ({
  readSyncDetails: vi.fn(async () => ({ pending: 0, decks: 2, cards: 40, reviews: 7 })),
}));

const { bundles, settingsRef, update } = vi.hoisted(() => ({
  bundles: vi.fn(async (): Promise<string[]> => []),
  settingsRef: { value: { bundle: 'taiwan', onboardedAt: 1 } as { bundle: string | null; onboardedAt: number | null } },
  update: vi.fn(async (_patch: object) => {}),
}));

vi.mock('~core/db/repositories', () => ({ lessonProgress: { bundles } }));
vi.mock('~/composables/useSettings', () => ({ useSettings: () => ({ settings: settingsRef, update }) }));
vi.mock('~core/sync', () => ({ runSync }));
vi.mock('~core/db/sync-details', () => ({ readSyncDetails }));
vi.mock('~core/sync/supabase', () => ({ createSupabaseTransport: vi.fn(() => ({})) }));
vi.mock('~/utils/supabaseClient', () => ({ getSupabaseClient: vi.fn(() => ({})) }));
vi.mock('~/composables/useAuth', () => ({ useAuth: () => ({ user: userRef }) }));

/** Lets queued promise callbacks run, so a waiting call can start. */
async function flush(): Promise<void> {
  for (let i = 0; i < 5; i += 1) await Promise.resolve();
}

afterEach(() => {
  vi.restoreAllMocks();
  vi.useRealTimers();
});

describe('useSync', () => {
  it('never runs two syncs at once, and services a trigger that arrives mid-run exactly once more', async () => {
    const { useSync } = await import('~/composables/useSync');
    const { triggerSync } = useSync();
    calls.length = 0;
    calls.state.maxInFlight = 0;
    userRef.value = { id: 'user-1' };

    void triggerSync();
    expect(calls).toHaveLength(1);

    // Arrives while the first run is still in flight.
    void triggerSync();
    await flush();
    expect(calls).toHaveLength(1); // no second run started yet

    calls[0]!.resolve();
    await flush();
    expect(calls).toHaveLength(2); // the pending trigger's own run starts once the first settles

    calls[1]!.resolve();
    await flush();

    expect(calls.state.maxInFlight).toBe(1);
  });

  it('refreshes the sync details once a run settles', async () => {
    const { useSync } = await import('~/composables/useSync');
    const { triggerSync, details } = useSync();
    calls.length = 0;
    userRef.value = { id: 'user-1' };
    readSyncDetails.mockClear();

    void triggerSync();
    expect(readSyncDetails).not.toHaveBeenCalled();
    calls[0]!.resolve();
    await flush();
    expect(readSyncDetails).toHaveBeenCalledTimes(1);
    expect(details.value).toEqual({ pending: 0, decks: 2, cards: 40, reviews: 7 });
  });

  it('debounces a burst of writes into a single run', async () => {
    vi.useFakeTimers();
    const { useSync } = await import('~/composables/useSync');
    const { notifyWrite } = useSync();
    calls.length = 0;
    userRef.value = { id: 'user-1' };

    notifyWrite();
    await vi.advanceTimersByTimeAsync(200);
    notifyWrite();
    await vi.advanceTimersByTimeAsync(200);
    notifyWrite();
    expect(calls).toHaveLength(0); // each write pushed the debounce window out again

    await vi.advanceTimersByTimeAsync(900);
    expect(calls).toHaveLength(1); // exactly one run, after the last write's debounce elapsed

    calls[0]!.resolve();
  });

  it('reports status idle, not an error, when nobody is signed in — sync is optional', async () => {
    const { useSync } = await import('~/composables/useSync');
    const { triggerSync, status } = useSync();
    calls.length = 0;
    userRef.value = null;

    await triggerSync();

    expect(status.value).toBe('idle');
    expect(calls).toHaveLength(0);
    userRef.value = { id: 'user-1' }; // leave signed in for later tests in this file
  });

  it('sets status error and records the message when a push fails, without throwing', async () => {
    const { useSync } = await import('~/composables/useSync');
    const { triggerSync, status, error } = useSync();
    calls.length = 0;
    userRef.value = { id: 'user-1' };

    const result = triggerSync();
    calls[0]!.reject(new Error('network down'));
    await expect(result).resolves.toBeUndefined();

    expect(status.value).toBe('error');
    expect(error.value).toBe('network down');
  });

  describe('following the studied bundle after sign-in', () => {
    async function signInAs(id: string, studied: string[], active: string | null, onboardedAt: number | null) {
      const { useSync } = await import('~/composables/useSync');
      calls.length = 0;
      update.mockClear();
      bundles.mockResolvedValue(studied);
      settingsRef.value = { bundle: active, onboardedAt };
      userRef.value = { id };
      const run = useSync().triggerSync();
      calls[0]!.resolve();
      await run;
      userRef.value = { id: 'user-1' };
    }

    it('switches to the only bundle with lesson progress and marks the device onboarded', async () => {
      await signInAs('follow-1', ['mainland'], 'taiwan', null);
      expect(update).toHaveBeenCalledTimes(1);
      expect(update).toHaveBeenCalledWith({ bundle: 'mainland', onboardedAt: expect.any(Number) });
    });

    it('keeps onboardedAt when it is already set', async () => {
      await signInAs('follow-2', ['mainland'], 'taiwan', 5);
      expect(update).toHaveBeenCalledWith({ bundle: 'mainland' });
    });

    it('leaves the choice alone when progress is in both bundles, in neither, or already in the active one', async () => {
      await signInAs('follow-3', ['mainland', 'taiwan'], 'taiwan', 5);
      await signInAs('follow-4', [], 'taiwan', 5);
      await signInAs('follow-5', ['taiwan'], 'taiwan', 5);
      expect(update).not.toHaveBeenCalled();
    });

    it('does it only on the first pull after a sign-in', async () => {
      await signInAs('follow-6', ['mainland'], 'taiwan', 5);
      update.mockClear();
      await signInAs('follow-6', ['mainland'], 'taiwan', 5);
      expect(update).not.toHaveBeenCalled();
    });
  });
});
