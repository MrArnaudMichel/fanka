import 'fake-indexeddb/auto';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { db } from '~core/db/db';
import { DEFAULT_SETTINGS, loadSettings } from '~core/db/settings';
import { seedIfNeeded } from '~core/seed/seed';
import { useDisposableSessions } from './disposableSessions';

const NOW = Date.parse('2026-09-16T08:00:00Z');

// Wraps the real loadSettings so the test can gate its *next* call
// (mockImplementationOnce) while every other call falls through to the real
// implementation set as the mock's default below.
vi.mock('~core/db/settings', async (importOriginal) => {
  const actual = await importOriginal<typeof import('~core/db/settings')>();
  return { ...actual, loadSettings: vi.fn(actual.loadSettings) };
});

const createSession = useDisposableSessions();

beforeEach(async () => {
  await db.delete();
  await db.open();
  await seedIfNeeded(NOW);
});

afterEach(() => {
  vi.restoreAllMocks();
  vi.mocked(loadSettings).mockReset();
});

// In a file of its own, so no other test's session can ever be registered
// on this `document` when the event is dispatched. A leftover listener
// ahead of this test's own would be the one to call loadSettings() first,
// consuming the one-shot gate meant for this session's refresh — which would
// then run ungated, never go stale, and pass whether or not the guard it
// exists to test is there. `createSession()` disposes every session at test
// end as well, so this holds even if more tests are ever added here.
describe('useReviewSession — a stale visibilitychange refresh does not overwrite a card the cursor has since moved off of', () => {
  it('discards the refresh once it resolves against a card that is no longer current', async () => {
    const session = createSession();
    await session.start();

    // Gates only the visibilitychange handler's own loadSettings() call.
    // grade()'s own call, and the one refreshCurrent() makes for the card
    // it moves to, are later calls to the same mock and are not affected —
    // by the time they run, the gate has already been consumed.
    let releaseGate!: () => void;
    const gate = new Promise<void>((resolve) => {
      releaseGate = resolve;
    });
    vi.mocked(loadSettings).mockImplementationOnce(async () => {
      await gate;
      return DEFAULT_SETTINGS;
    });

    const callsBeforeDispatch = vi.mocked(loadSettings).mock.calls.length;
    try {
      vi.spyOn(document, 'visibilityState', 'get').mockReturnValue('visible');
      document.dispatchEvent(new Event('visibilitychange'));
      // The handler's refreshPreview() call for the *current* card is now
      // blocked on the gate, mid-flight. Exactly one listener — this
      // session's — may have called loadSettings(), so the gate is known to
      // be held by this refresh rather than by any other caller.
      expect(loadSettings).toHaveBeenCalledTimes(callsBeforeDispatch + 1);

      session.reveal();
      await session.grade(3); // moves the cursor to a new card, previews included
      const previewsAfterGrade = session.previews.value;

      releaseGate();
      // Let the now-unblocked, stale refreshPreview() settle.
      await new Promise((resolve) => setTimeout(resolve, 0));
      await new Promise((resolve) => setTimeout(resolve, 0));

      // Without the `current.value?.id === item.id` re-check inside
      // refreshPreview(), this would now hold the *old* card's preview,
      // computed against the anchor captured when the gate was finally
      // released — overwriting what grade() had already correctly set for
      // the new card.
      expect(session.previews.value).toBe(previewsAfterGrade);
    } finally {
      // Never leave the gated refresh hanging if an assertion above fails.
      releaseGate();
    }
  });
});
