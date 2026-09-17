import 'fake-indexeddb/auto';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { db } from '~core/db/db';
import { seedIfNeeded } from '~core/seed/seed';
import { useReviewSession } from '~/composables/useReviewSession';

const NOW = Date.parse('2026-09-16T08:00:00Z');

beforeEach(async () => {
  await db.delete();
  await db.open();
  await seedIfNeeded(NOW);
});

// Kept in its own file, rather than alongside the rest of useReviewSession's
// tests: happy-dom gives every test *file* its own `document`, but all
// `it()` blocks within one file share it. Every other test in this suite
// that calls start()/restore() registers a real `visibilitychange` listener
// (composables here have no component to tie `onScopeDispose` cleanup to
// outside a real app), which sits dormant for the rest of that file — until
// something actually dispatches the event, at which point *every*
// still-registered listener fires, including ones left by earlier tests
// whose sessions reference database rows a later test's `beforeEach` has
// since wiped. Isolating the one test that dispatches the event keeps that
// cross-test leakage from ever mattering.
describe('useReviewSession — intervals survive backgrounding', () => {
  it('refreshes intervals on visibilitychange without decaying them, hiding a revealed answer again, or resetting the duration clock', async () => {
    vi.useFakeTimers({ toFake: ['Date', 'setInterval', 'clearInterval'] });
    vi.setSystemTime(NOW);
    try {
      const session = useReviewSession();
      await session.start();
      session.reveal();
      expect(session.revealed.value).toBe(true);

      const intervalAtStart = session.intervals.value[3];
      const dueAtStart = session.previews.value[3]!.due;
      expect(intervalAtStart).toBeGreaterThan(0);

      // 40 minutes pass while the WebView is backgrounded; nothing runs.
      vi.advanceTimersByTime(40 * 60_000);

      // Anchored to preview time, not to a live `due - Date.now()`
      // subtraction, so this must not have decayed toward "1 min".
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
