import { afterEach, describe, expect, it, vi } from 'vitest';

// Each call to the mocked seed hangs until the test settles it by hand, and
// the mock records how many calls were in flight at once.
const { calls, seedIfNeeded } = vi.hoisted(() => {
  const calls: { resolve: () => void; reject: (err: Error) => void }[] = [];
  let inFlight = 0;
  const state = { maxInFlight: 0 };
  const seedIfNeeded = vi.fn(
    () =>
      new Promise<{ seeded: boolean; deckCount: number }>((resolve, reject) => {
        inFlight += 1;
        state.maxInFlight = Math.max(state.maxInFlight, inFlight);
        const done = () => {
          inFlight -= 1;
        };
        calls.push({
          resolve: () => {
            done();
            resolve({ seeded: true, deckCount: 1 });
          },
          reject: (err) => {
            done();
            reject(err);
          },
        });
      }),
  );
  return { calls: Object.assign(calls, { state }), seedIfNeeded };
});

vi.mock('~core/seed/seed', () => ({ seedIfNeeded }));

/** Lets queued promise callbacks run, so a waiting call can start. */
async function flush(): Promise<void> {
  for (let i = 0; i < 5; i += 1) await Promise.resolve();
}

// Module-scope state (the chain, `failed`) is shared across tests, so each
// test settles every call it starts before it ends.
afterEach(() => {
  vi.restoreAllMocks();
});

describe('useSeedStatus().retry', () => {
  it('reports success to a call made while another was still running', async () => {
    const { useSeedStatus } = await import('~/composables/useSeedStatus');
    const { retry, retrying } = useSeedStatus();
    calls.length = 0;
    calls.state.maxInFlight = 0;

    const first = retry();
    const second = retry();
    await flush();
    expect(retrying.value).toBe(true);

    calls[0]!.resolve();
    await flush();
    // The second call waited its turn, then ran its own attempt.
    expect(calls).toHaveLength(2);
    calls[1]!.resolve();

    // Neither says "failed": an overlapping call is not a failure.
    expect(await first).toBe(true);
    expect(await second).toBe(true);
    // Two seeds never ran at once.
    expect(calls.state.maxInFlight).toBe(1);
    await flush();
    expect(retrying.value).toBe(false);
  });

  it('reports false only for an attempt that failed, and marks the seed failed', async () => {
    vi.spyOn(console, 'error').mockImplementation(() => undefined);
    const { useSeedStatus } = await import('~/composables/useSeedStatus');
    const { retry, failed } = useSeedStatus();
    calls.length = 0;

    const attempt = retry();
    await flush();
    calls[0]!.reject(new Error('simulated seed failure'));
    expect(await attempt).toBe(false);
    expect(failed.value).toBe(true);

    // The chain is not stalled by the failure: the next retry runs and wins.
    const again = retry();
    await flush();
    calls[1]!.resolve();
    expect(await again).toBe(true);
    expect(failed.value).toBe(false);
  });
});
