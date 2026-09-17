import 'fake-indexeddb/auto';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { db } from '~core/db/db';
import { cards, items, reviews } from '~core/db/repositories';
import { loadSession, saveSession } from '~core/db/session';
import { saveSettings } from '~core/db/settings';
import { seedIfNeeded } from '~core/seed/seed';
import { useDisposableSessions } from './disposableSessions';

const NOW = Date.parse('2026-09-16T08:00:00Z');
const DAY = 86_400_000;

const createSession = useDisposableSessions();

beforeEach(async () => {
  await db.delete();
  await db.open();
  await seedIfNeeded(NOW);
});

// Restores every spy here even when a test fails before reaching its end, so
// a mocked rejection can never leak into the next test.
afterEach(() => {
  vi.restoreAllMocks();
});

describe('useReviewSession', () => {
  it('starts with a card and nothing revealed', async () => {
    const session = createSession();
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
    const session = createSession();
    await session.start();
    expect(Object.keys(session.previews.value).map(Number).sort()).toEqual([1, 2, 3, 4]);
  });

  it('advances to the next item after a grade', async () => {
    const session = createSession();
    await session.start();
    const first = session.current.value!.id;
    session.reveal();
    await session.grade(3);
    expect(session.current.value?.id).not.toBe(first);
    expect(session.revealed.value).toBe(false);
  });

  it('writes a review row for every grade', async () => {
    const session = createSession();
    await session.start();
    session.reveal();
    await session.grade(3);
    expect(await db.reviews.count()).toBe(1);
  });

  it('undo restores the previous item and its state exactly', async () => {
    const started = createSession();
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
    const resumed = createSession();
    await resumed.restore();
    await resumed.undo();

    expect(resumed.current.value!.id).toBe(first.id);
    expect(resumed.current.value).toEqual(before);
    expect(await db.items.get(first.id)).toEqual(before);
    expect(await db.reviews.count()).toBe(0);
  });

  it('undo restores the previous item within a single instance — the page\'s normal flow', async () => {
    const session = createSession();
    await session.start();
    const first = session.current.value!;
    const before = (await db.items.get(first.id))!;
    session.reveal();
    await session.grade(3);
    await session.undo();

    expect(session.current.value!.id).toBe(first.id);
    expect(await db.items.get(first.id)).toEqual(before);
    expect(await db.reviews.count()).toBe(0);
    // The card returns already revealed, since the learner was looking at
    // its answer when they undid the grade.
    expect(session.revealed.value).toBe(true);
  });

  it('ends when the queue is exhausted', async () => {
    const session = createSession();
    await session.start();
    const total = session.total.value;
    for (let i = 0; i < total; i += 1) {
      session.reveal();
      await session.grade(3);
    }
    expect(session.ended.value).toBe(true);
  });

  it('resumes a session that was interrupted', async () => {
    const first = createSession();
    await first.start();
    first.reveal();
    await first.grade(3);
    const positionBefore = first.position.value;

    const resumed = createSession();
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
      const session = createSession();
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

/**
 * What a re-anchored cursor should resolve to once `queueIds` (in original
 * queue order) is filtered down to whatever `items.visible()` still
 * returns: the survivor sitting at the position equal to how many of the
 * ids *before* `cursor` survived. Mirrors the fix's own specification
 * (count survivors before the cursor) rather than a hand-picked index, so
 * it stays correct regardless of how many entries a given drop removes —
 * soft-deleting a card can remove both of its directions from the queue,
 * not just the one a test happens to look at.
 */
async function expectedResumeId(queueIds: string[], cursor: number): Promise<string | undefined> {
  const visibleIds = new Set((await items.visible(queueIds)).map((i) => i.id));
  const survivors = queueIds.filter((id) => visibleIds.has(id));
  const survivedBeforeCursor = queueIds.slice(0, cursor).filter((id) => visibleIds.has(id)).length;
  return survivors[survivedBeforeCursor];
}

describe('useReviewSession — restore respects visibility, not mere row existence', () => {
  // This app only ever soft-deletes (Card/Deck `deletedAt`) or suspends (an
  // Item flag); it never removes an Item row. A restore that only checks
  // "does the row still exist" (a bare bulkGet + drop the misses) can never
  // actually exclude anything a learner did mid-session, since the row is
  // always still there — regardless of *where* in the queue the affected
  // item happens to land. That is why these assert on `queue.value`/
  // `total.value` rather than only a hand-picked `current.id`: an id-only
  // assertion only fails against the old row-existence check when the
  // dropped item happens to sit exactly at the re-anchored cursor, which is
  // a detail of seed order and buildQueue's interleaving, not of what the
  // fix is supposed to guarantee. The membership/count assertions fail
  // against the old check unconditionally, because it never drops anything
  // a soft-delete or a suspend produces, full stop — but they alone do not
  // pin down *which* card the cursor should land on, which is what the
  // re-anchoring logic (as opposed to mere filtering) is actually for; the
  // two "behind the cursor" cases also assert the exact expected id via
  // `expectedResumeId`.

  it('drops an item whose card was soft-deleted, from behind the cursor', async () => {
    const first = createSession();
    await first.start();
    const originalIds = first.queue.value.map((i) => i.id);
    const originalTotal = originalIds.length;
    expect(originalTotal).toBeGreaterThanOrEqual(3);

    first.reveal();
    await first.grade(3);
    first.reveal();
    await first.grade(3);
    expect(first.index.value).toBe(2);

    const droppedId = originalIds[0]!; // already graded — behind the cursor
    const droppedCardId = (await db.items.get(droppedId))!.cardId;
    await db.cards.put({ ...(await cards.get(droppedCardId))!, deletedAt: NOW });
    const expectedNextId = await expectedResumeId(originalIds, 2);

    const resumed = createSession();
    await resumed.restore();

    expect(resumed.queue.value.map((i) => i.id)).not.toContain(droppedId);
    expect(resumed.total.value).toBeLessThan(originalTotal);
    expect(resumed.current.value?.id).toBe(expectedNextId);
  });

  it('drops an item that was suspended, from behind the cursor', async () => {
    const first = createSession();
    await first.start();
    const originalIds = first.queue.value.map((i) => i.id);
    const originalTotal = originalIds.length;
    expect(originalTotal).toBeGreaterThanOrEqual(3);

    first.reveal();
    await first.grade(3);
    first.reveal();
    await first.grade(3);
    expect(first.index.value).toBe(2);

    const droppedId = originalIds[0]!; // already graded — behind the cursor
    await items.put({ ...(await items.get(droppedId))!, suspended: true });
    const expectedNextId = await expectedResumeId(originalIds, 2);

    const resumed = createSession();
    await resumed.restore();

    expect(resumed.queue.value.map((i) => i.id)).not.toContain(droppedId);
    expect(resumed.total.value).toBeLessThan(originalTotal);
    expect(resumed.current.value?.id).toBe(expectedNextId);
  });

  it('drops the item the cursor would land on, and shows the next one instead', async () => {
    const first = createSession();
    await first.start();
    const originalIds = first.queue.value.map((i) => i.id);
    const originalTotal = originalIds.length;
    expect(originalTotal).toBeGreaterThanOrEqual(3);

    first.reveal();
    await first.grade(3);
    first.reveal();
    await first.grade(3);
    expect(first.index.value).toBe(2);

    // Unlike the two cases above, this one hides the item *at* the cursor —
    // the one the old row-existence check "resuming" onto would actually
    // show the learner, past-graded state and all, and the one a
    // seed-order-dependent id assertion could accidentally pass against.
    const droppedId = originalIds[2]!;
    await items.put({ ...(await items.get(droppedId))!, suspended: true });
    const expectedNextId = await expectedResumeId(originalIds, 2);

    const resumed = createSession();
    await resumed.restore();

    expect(resumed.queue.value.map((i) => i.id)).not.toContain(droppedId);
    expect(resumed.total.value).toBeLessThan(originalTotal);
    expect(resumed.current.value?.id).not.toBe(droppedId);
    // The title's claim ("shows the next one instead") — not merely that
    // it isn't the dropped id, but that it is specifically the one the
    // re-anchor logic says it should be.
    expect(resumed.current.value?.id).toBe(expectedNextId);
  });
});

describe('useReviewSession — grade/undo/start/restore are serialised, not dropped', () => {
  it('drops a second grade() while one is already queued or in flight, so only one review is recorded', async () => {
    const session = createSession();
    await session.start();
    session.reveal();

    // Fired without awaiting the first — an ordinary mis-tap on a grade
    // button while the first tap's write is still in flight. This is the
    // one case that *should* be dropped: the second tap is the bug.
    const firstCall = session.grade(3);
    const secondCall = session.grade(3);
    await Promise.all([firstCall, secondCall]);

    expect(await db.reviews.count()).toBe(1);
    expect(session.index.value).toBe(1);
  });

  it('runs an undo fired the instant an unawaited grade lands, in order, rather than dropping it', async () => {
    const session = createSession();
    await session.start();
    session.reveal();

    // Neither call is awaited before the next fires — undo() must not be
    // silently swallowed just because a grade() is still writing.
    const gradeCall = session.grade(3);
    const undoCall = session.undo();
    await Promise.all([gradeCall, undoCall]);

    // The review was written by grade(), then removed by undo(): net zero.
    // If undo() were dropped instead of queued (the a1f71fc bug this
    // guards against), the review from grade() would stay written and the
    // cursor would stay one card ahead — 1 review and index 1, not 0 and 0.
    expect(await db.reviews.count()).toBe(0);
    expect(session.index.value).toBe(0);
  });

  it('re-arms grading once an undo is queued behind an unfinished grade, so grade-undo-grade records the correction', async () => {
    const session = createSession();
    await session.start();
    session.reveal();

    // All three fired without awaiting any of the previous ones. A plain
    // "is a grade in flight anywhere" guard cannot tell this apart from a
    // double-tap and would drop the corrected grade — silently losing the
    // learner's second answer, the same kind of loss this guard exists to
    // prevent, just reached via a different call order.
    const wrongGrade = session.grade(3);
    const undoCall = session.undo();
    const correctionGrade = session.grade(4);
    await Promise.all([wrongGrade, undoCall, correctionGrade]);

    expect(await db.reviews.count()).toBe(1);
    const [review] = await db.reviews.toArray();
    expect(review!.grade).toBe(4);
    expect(session.index.value).toBe(1);
  });

  it('never returns a dropped false from restore(): a second concurrent call gets the real answer too', async () => {
    // A prior session with real progress, stored the way a first instance
    // would leave it.
    const priorSession = createSession();
    await priorSession.start();
    priorSession.reveal();
    await priorSession.grade(3);
    const storedPosition = priorSession.position.value;
    const storedTotal = priorSession.total.value;

    // Task 12's page pattern is `if (!(await restore())) await start()` —
    // safe only if restore() never lies about what it found. Fired twice
    // on the same instance without awaiting either call first, simulating
    // whatever double-invokes a page's own mount logic (a duplicate
    // effect, hot-reload, a re-entered async setup): a guard that could
    // drop a second call while the first was still in flight would report
    // a genuine restore as a miss, and the page's own fallback would then
    // call start(), clobbering it. Asserted directly on both return
    // values, rather than by also racing a start() call after — that
    // second race only actually corrupts anything in a narrow timing
    // window this environment's real Dexie/IndexedDB scheduling does not
    // reliably land in, which would make a test built on it either
    // flaky or silently toothless. This is the guarantee whose violation
    // is what would let that corruption happen at all.
    const session = createSession();
    const [firstResult, secondResult] = await Promise.all([session.restore(), session.restore()]);

    expect(firstResult).toBe(true);
    expect(secondResult).toBe(true);
    expect(session.position.value).toBe(storedPosition);
    expect(session.total.value).toBe(storedTotal);
    expect(await loadSession()).not.toBeNull();
  });

  it('exposes busy while something is queued or running, and clears it once idle', async () => {
    const session = createSession();
    await session.start();
    expect(session.busy.value).toBe(false);

    session.reveal();
    const gradeCall = session.grade(3);
    expect(session.busy.value).toBe(true);
    await gradeCall;
    expect(session.busy.value).toBe(false);
  });

  it('keeps busy true across multiple queued actions, clearing it only once the whole chain drains — even after one step rejects', async () => {
    const session = createSession();
    await session.start();
    session.reveal();

    vi.spyOn(reviews, 'record').mockRejectedValueOnce(new Error('simulated write failure'));

    const failingGrade = session.grade(3).catch(() => undefined);
    expect(session.busy.value).toBe(true);

    // Queued behind the failing grade — busy must still read true, since
    // the chain has not drained yet.
    const undoCall = session.undo();
    expect(session.busy.value).toBe(true);

    await Promise.all([failingGrade, undoCall]);

    expect(session.busy.value).toBe(false);
  });

  it('does not let a rejected action stall whatever is queued behind it', async () => {
    const session = createSession();
    await session.start();
    session.reveal();

    vi.spyOn(reviews, 'record').mockRejectedValueOnce(new Error('simulated write failure'));

    const failingGrade = session.grade(3).catch(() => undefined);
    // Queued behind the failing grade. If the chain stalled on the
    // rejection instead of moving on, this would never resolve and the
    // test would time out rather than fail cleanly.
    const undoCall = session.undo();

    await failingGrade;
    await undoCall;

    // The grade never actually wrote anything before rejecting, so there
    // is nothing for undo() to undo — it runs as a safe no-op, not stuck.
    expect(await db.reviews.count()).toBe(0);
  });
});

describe('useReviewSession — ended reflects an empty queue too', () => {
  it('reports ended, not a stuck mid-session, when start() finds nothing due or new', async () => {
    await saveSettings({ newPerDay: 0 });
    const session = createSession();
    await session.start();
    expect(session.total.value).toBe(0);
    expect(session.current.value).toBeNull();
    expect(session.ended.value).toBe(true);
  });
});

describe('useReviewSession — restore refuses a session that cannot be resumed', () => {
  it('returns false and clears the stored session once every card has been graded', async () => {
    const session = createSession();
    await session.start();
    const total = session.total.value;
    for (let i = 0; i < total; i += 1) {
      session.reveal();
      await session.grade(3);
    }
    expect(session.ended.value).toBe(true);

    const resumed = createSession();
    expect(await resumed.restore()).toBe(false);
    expect(await loadSession()).toBeNull();
  });

  it('returns false and clears a session that was started before today', async () => {
    await saveSession({ queueIds: ['whatever-item-id'], index: 0, startedAt: NOW - DAY, log: [] });

    const session = createSession();
    expect(await session.restore(NOW)).toBe(false);
    expect(await loadSession()).toBeNull();
  });

  it('returns false and clears a session whose remaining cards were all hidden since it was stored', async () => {
    const session = createSession();
    await session.start();
    const originalIds = session.queue.value.map((i) => i.id);
    expect(originalIds.length).toBeGreaterThanOrEqual(2);

    session.reveal();
    await session.grade(3); // stored index is now 1 — well short of queueIds.length

    // Everything still ahead of the cursor is suspended. The stored index
    // itself never reaches the stored queue's length, so a "finished"
    // check against the raw numbers alone would miss this entirely.
    for (const id of originalIds.slice(1)) {
      await items.put({ ...(await items.get(id))!, suspended: true });
    }

    const resumed = createSession();
    expect(await resumed.restore()).toBe(false);
    expect(await loadSession()).toBeNull();
  });
});

describe('useReviewSession — undo is inert without an item to restore onto', () => {
  it('does not move the cursor (or the log, or the review row) when the item to restore is gone', async () => {
    const session = createSession();
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
