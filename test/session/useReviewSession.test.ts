import 'fake-indexeddb/auto';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { db } from '~core/db/db';
import { cards, items } from '~core/db/repositories';
import { loadSession, saveSession } from '~core/db/session';
import { saveSettings } from '~core/db/settings';
import { seedIfNeeded } from '~core/seed/seed';
import { useReviewSession } from '~/composables/useReviewSession';

const NOW = Date.parse('2026-09-16T08:00:00Z');
const DAY = 86_400_000;

beforeEach(async () => {
  await db.delete();
  await db.open();
  await seedIfNeeded(NOW);
});

/**
 * What a re-anchored cursor should resolve to once `queueIds` (in original
 * queue order) is filtered down to whatever `items.visible()` still
 * returns: the survivor sitting at the position equal to how many of the
 * ids *before* `cursor` survived. Mirrors the fix's own specification
 * rather than a hand-picked index, so a test using this stays correct
 * regardless of how many entries a given drop happens to remove.
 */
async function expectedResumeId(queueIds: string[], cursor: number): Promise<string | undefined> {
  const visibleIds = new Set((await items.visible(queueIds)).map((i) => i.id));
  const survivors = queueIds.filter((id) => visibleIds.has(id));
  const survivedBeforeCursor = queueIds.slice(0, cursor).filter((id) => visibleIds.has(id)).length;
  return survivors[survivedBeforeCursor];
}

describe('useReviewSession', () => {
  it('starts with a card and nothing revealed', async () => {
    const session = useReviewSession();
    await session.start();
    expect(session.current.value).not.toBeNull();
    expect(session.revealed.value).toBe(false);
    expect(session.total.value).toBeGreaterThan(0);

    // The assertion above only checks the initial default — it would pass
    // even if reveal() were a no-op. Exercise the toggle itself.
    session.reveal();
    expect(session.revealed.value).toBe(true);
  });

  it('previews all four intervals before a grade is chosen', async () => {
    const session = useReviewSession();
    await session.start();
    expect(Object.keys(session.previews.value).map(Number).sort()).toEqual([1, 2, 3, 4]);
  });

  it('advances to the next item after a grade', async () => {
    const session = useReviewSession();
    await session.start();
    const first = session.current.value!.id;
    session.reveal();
    await session.grade(3);
    expect(session.current.value?.id).not.toBe(first);
    expect(session.revealed.value).toBe(false);
  });

  it('writes a review row for every grade', async () => {
    const session = useReviewSession();
    await session.start();
    session.reveal();
    await session.grade(3);
    expect(await db.reviews.count()).toBe(1);
  });

  it('undo restores the previous item and its state exactly', async () => {
    const started = useReviewSession();
    await started.start();
    const first = started.current.value!;
    const before = (await db.items.get(first.id))!;
    started.reveal();
    await started.grade(3);

    // Resumed in a *fresh* instance, so its queue is populated straight
    // from the post-review database rows rather than an in-memory object
    // `grade()` never touched. This is what makes `queue.value[index] =
    // restored` inside undo() load-bearing: `resumed`'s queue slot for
    // `first` holds the graded (post-review) SrsState until undo()
    // overwrites it — checking only `.id` afterwards (as the original
    // version of this test did) would pass even with that line deleted,
    // since the id never changes either way.
    const resumed = useReviewSession();
    await resumed.restore();
    await resumed.undo();

    expect(resumed.current.value!.id).toBe(first.id);
    expect(resumed.current.value).toEqual(before);
    expect(await db.items.get(first.id)).toEqual(before);
    expect(await db.reviews.count()).toBe(0);
  });

  it('ends when the queue is exhausted', async () => {
    const session = useReviewSession();
    await session.start();
    const total = session.total.value;
    for (let i = 0; i < total; i += 1) {
      session.reveal();
      await session.grade(3);
    }
    expect(session.ended.value).toBe(true);
  });

  it('resumes a session that was interrupted', async () => {
    const first = useReviewSession();
    await first.start();
    first.reveal();
    await first.grade(3);
    const positionBefore = first.position.value;

    const resumed = useReviewSession();
    await resumed.restore();
    expect(resumed.position.value).toBe(positionBefore);
    expect(resumed.ended.value).toBe(false);
  });
});

describe('useReviewSession — elapsed clock', () => {
  it('ticks forward as time passes, rather than freezing at the value read on start', async () => {
    vi.useFakeTimers({ toFake: ['Date', 'setInterval', 'clearInterval'] });
    vi.setSystemTime(NOW);
    try {
      const session = useReviewSession();
      await session.start();
      expect(session.elapsed.value).toBe(0);

      vi.advanceTimersByTime(65_000);
      expect(session.elapsed.value).toBe(65_000);

      // Grading through the whole queue ends the session; the clock should
      // stop advancing rather than keep ticking a finished session forever.
      const total = session.total.value;
      for (let i = 0; i < total; i += 1) {
        session.reveal();
        await session.grade(3);
      }
      expect(session.ended.value).toBe(true);
      const elapsedAtEnd = session.elapsed.value;
      vi.advanceTimersByTime(10_000);
      expect(session.elapsed.value).toBe(elapsedAtEnd);
    } finally {
      vi.useRealTimers();
    }
  });
});

describe('useReviewSession — restore respects visibility, not mere row existence', () => {
  // This app only ever soft-deletes (Card/Deck `deletedAt`) or suspends (an
  // Item flag); it never removes an Item row. A restore that only checks
  // "does the row still exist" (a bare bulkGet + drop the misses) is
  // therefore unreachable dead code in production — these two cases are the
  // ones that actually happen when a learner deletes a deck, or a card is
  // suspended, mid-session.

  it('drops an item whose card was soft-deleted while the session was interrupted', async () => {
    const first = useReviewSession();
    await first.start();
    const originalIds = first.queue.value.map((i) => i.id);
    expect(originalIds.length).toBeGreaterThanOrEqual(3);

    first.reveal();
    await first.grade(3);
    first.reveal();
    await first.grade(3);
    expect(first.index.value).toBe(2);

    // Every seeded card has both a recognition and a production item, and
    // both commonly land in the same session — so soft-deleting the card
    // behind `originalIds[0]` can drop *two* queue entries, not one, if its
    // other direction is elsewhere in the queue too. The expectation is
    // computed the same way the fix is specified (survivors before the
    // cursor), rather than assumed to be "index 2", so the test holds
    // regardless of how many entries that one card removes.
    const droppedCardId = (await db.items.get(originalIds[0]!))!.cardId;
    await db.cards.put({ ...(await cards.get(droppedCardId))!, deletedAt: NOW });
    const expectedNextId = await expectedResumeId(originalIds, 2);

    const resumed = useReviewSession();
    await resumed.restore();

    expect(resumed.current.value?.id).toBe(expectedNextId);
  });

  it('drops an item that was suspended while the session was interrupted', async () => {
    const first = useReviewSession();
    await first.start();
    const originalIds = first.queue.value.map((i) => i.id);
    expect(originalIds.length).toBeGreaterThanOrEqual(3);

    first.reveal();
    await first.grade(3);
    first.reveal();
    await first.grade(3);
    expect(first.index.value).toBe(2);

    await items.put({ ...(await items.get(originalIds[0]!))!, suspended: true });
    const expectedNextId = await expectedResumeId(originalIds, 2);

    const resumed = useReviewSession();
    await resumed.restore();

    expect(resumed.current.value?.id).toBe(expectedNextId);
  });
});

describe('useReviewSession — grade() is re-entrant safe', () => {
  it('serialises a double-tap so only one review is recorded and the cursor advances once', async () => {
    const session = useReviewSession();
    await session.start();
    session.reveal();

    // Fired without awaiting the first — an ordinary mis-tap on a grade
    // button while the first tap's write is still in flight.
    const firstCall = session.grade(3);
    const secondCall = session.grade(3);
    await Promise.all([firstCall, secondCall]);

    expect(await db.reviews.count()).toBe(1);
    expect(session.index.value).toBe(1);
  });
});

describe('useReviewSession — ended reflects an empty queue too', () => {
  it('reports ended, not a stuck mid-session, when start() finds nothing due or new', async () => {
    await saveSettings({ newPerDay: 0 });
    const session = useReviewSession();
    await session.start();
    expect(session.total.value).toBe(0);
    expect(session.current.value).toBeNull();
    expect(session.ended.value).toBe(true);
  });
});

describe('useReviewSession — restore refuses a session that cannot be resumed', () => {
  it('returns false and clears the stored session once every card has been graded', async () => {
    const session = useReviewSession();
    await session.start();
    const total = session.total.value;
    for (let i = 0; i < total; i += 1) {
      session.reveal();
      await session.grade(3);
    }
    expect(session.ended.value).toBe(true);

    const resumed = useReviewSession();
    expect(await resumed.restore()).toBe(false);
    expect(await loadSession()).toBeNull();
  });

  it('returns false and clears a session that was started before today', async () => {
    await saveSession({ queueIds: ['whatever-item-id'], index: 0, startedAt: NOW - DAY, log: [] });

    const session = useReviewSession();
    expect(await session.restore(NOW)).toBe(false);
    expect(await loadSession()).toBeNull();
  });
});

describe('useReviewSession — undo is inert without an item to restore onto', () => {
  it('does not move the cursor (or the log, or the review row) when the item to restore is gone', async () => {
    const session = useReviewSession();
    await session.start();
    const first = session.current.value!;
    session.reveal();
    await session.grade(3);
    const positionAfterGrade = session.position.value;

    // The item is gone by the time undo runs. This app never hard-deletes
    // an Item itself, but undo must not corrupt the cursor even if
    // something else ever does.
    await db.items.delete(first.id);

    await session.undo();

    expect(session.position.value).toBe(positionAfterGrade);
    expect(await db.reviews.count()).toBe(1);
  });
});
