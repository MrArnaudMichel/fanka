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

describe('useReviewSession', () => {
  it('starts with a card and nothing revealed', async () => {
    const session = useReviewSession();
    await session.start();
    expect(session.current.value).not.toBeNull();
    expect(session.revealed.value).toBe(false);
    expect(session.total.value).toBeGreaterThan(0);
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
    const session = useReviewSession();
    await session.start();
    const first = session.current.value!;
    const before = (await db.items.get(first.id))!;
    session.reveal();
    await session.grade(3);
    await session.undo();
    expect(session.current.value!.id).toBe(first.id);
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

describe('useReviewSession — restore after an item is dropped', () => {
  it('re-anchors the cursor by counting survivors, not by reusing the raw stored offset', async () => {
    const first = useReviewSession();
    await first.start();

    // Capture the full original queue order before anything is graded.
    const originalIds = first.queue.value.map((i) => i.id);
    expect(originalIds.length).toBeGreaterThanOrEqual(3);

    // Grade the first two items, so the persisted cursor sits at index 2.
    first.reveal();
    await first.grade(3);
    first.reveal();
    await first.grade(3);
    expect(first.index.value).toBe(2);
    const expectedNextId = originalIds[2];

    // An item earlier than the cursor (index 0, already graded) is removed
    // from the database entirely, simulating a concurrent soft-delete.
    await db.items.delete(originalIds[0]!);

    const resumed = useReviewSession();
    await resumed.restore();

    // The naive `min(stored.index, queue.length)` clamp would land one
    // position too far forward here, because it does not account for the
    // dropped item shifting every later index down by one. The fix must
    // still land on the same card the learner was about to see.
    expect(resumed.current.value?.id).toBe(expectedNextId);
  });
});
