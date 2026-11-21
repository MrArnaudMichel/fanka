import 'fake-indexeddb/auto';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { db } from '~core/db/db';
import { loadSettings } from '~core/db/settings';
import { seedStarterDeck } from '../helpers/starterDeck';
import { useDisposableSessions } from './disposableSessions';

const NOW = Date.parse('2026-09-16T08:00:00Z');

// Wraps the real loadSettings so a single test can override its *next* call
// (mockImplementationOnce) without affecting any other call in the file —
// every call that doesn't get an override falls through to the real
// implementation set as the mock's default below.
vi.mock('~core/db/settings', async (importOriginal) => {
  const actual = await importOriginal<typeof import('~core/db/settings')>();
  return { ...actual, loadSettings: vi.fn(actual.loadSettings) };
});

const createSession = useDisposableSessions();

beforeEach(async () => {
  await db.delete();
  await db.open();
  await seedStarterDeck(NOW);
});

// Runs even when a test fails part-way: restores the `visibilityState` and
// `console.error` spies, and drops any one-shot loadSettings() override a
// failing test left unconsumed, so none of them can leak into the next test.
afterEach(() => {
  vi.restoreAllMocks();
  vi.mocked(loadSettings).mockReset();
});

// Kept apart from the rest of useReviewSession's tests because these
// dispatch `visibilitychange` on the `document` a file's tests share, and
// wrap loadSettings() in a file-scoped mock. Every session here is created
// through `createSession()`, which disposes its listener when its test ends
// (see disposableSessions.ts), so a dispatch only ever reaches the session
// of the test that sent it.
describe('useReviewSession — intervals survive backgrounding', () => {
  it('refreshes intervals on visibilitychange without decaying them, hiding a revealed answer again, or resetting the duration clock', async () => {
    vi.useFakeTimers({ toFake: ['Date', 'setInterval', 'clearInterval'] });
    vi.setSystemTime(NOW);
    try {
      const session = createSession();
      await session.start();
      session.reveal();
      expect(session.revealed.value).toBe(true);

      const intervalAtStart = session.intervals.value[3];
      const dueAtStart = session.previews.value[3]!.due;
      expect(intervalAtStart).toBeGreaterThan(0);

      // 40 minutes pass while the WebView is backgrounded; only the
      // session's one-second tick runs.
      vi.advanceTimersByTime(40 * 60_000);

      // What this does verify: nothing that runs while the page sits in the
      // background — above all the one-second tick advancing `clock` 2,400
      // times — changes the interval shown. An `intervals` derived from
      // `clock` would decay here and fail.
      //
      // What it cannot verify: that `intervals` is anchored to preview time
      // rather than to a live `due - Date.now()`. `intervals` is a computed
      // and `Date.now()` is not reactive, so a live subtraction would be
      // cached from the read above and return the same stale value here —
      // this assertion passes either way, and nothing else in this file
      // covers it (verified: swapping in `due - Date.now()` leaves it green).
      expect(session.intervals.value[3]).toBe(intervalAtStart);

      // The page becomes visible again.
      vi.spyOn(document, 'visibilityState', 'get').mockReturnValue('visible');
      document.dispatchEvent(new Event('visibilitychange'));
      // The listener fires refreshPreview() but does not await it; let its
      // chained Dexie/settings reads settle on the real microtask/macrotask
      // queue (only Date/setInterval/clearInterval are faked above).
      await new Promise((resolve) => setTimeout(resolve, 0));
      await new Promise((resolve) => setTimeout(resolve, 0));

      // The preview was recomputed against a fresh anchor roughly 40
      // minutes later, so the absolute due date it reports has moved
      // forward by roughly that much.
      const dueAfter = session.previews.value[3]!.due;
      expect(dueAfter - dueAtStart).toBeGreaterThan(39 * 60_000);
      expect(dueAfter - dueAtStart).toBeLessThan(41 * 60_000);

      // The answer the learner had already revealed before backgrounding
      // must still be revealed — refreshing the preview on visibilitychange
      // must not hide it again.
      expect(session.revealed.value).toBe(true);

      // Grading now must still measure the duration from when the card was
      // first shown, before backgrounding, not from when the phone was
      // unlocked 40 minutes later.
      await session.grade(3);
      const [review] = await db.reviews.toArray();
      expect(review!.durationMs).toBeGreaterThanOrEqual(40 * 60_000);
    } finally {
      vi.useRealTimers();
    }
  });
});

describe('useReviewSession — a failed visibilitychange refresh is logged, not left as an unhandled rejection', () => {
  it('catches a rejected loadSettings and reports it via console.error', async () => {
    const session = createSession();
    await session.start();

    const consoleErrorSpy = vi.spyOn(console, 'error').mockImplementation(() => undefined);
    vi.mocked(loadSettings).mockImplementationOnce(async () => {
      throw new Error('simulated settings load failure');
    });

    vi.spyOn(document, 'visibilityState', 'get').mockReturnValue('visible');
    document.dispatchEvent(new Event('visibilitychange'));

    // Let the rejected refreshPreview() settle.
    await new Promise((resolve) => setTimeout(resolve, 0));
    await new Promise((resolve) => setTimeout(resolve, 0));

    expect(consoleErrorSpy).toHaveBeenCalled();
  });
});
