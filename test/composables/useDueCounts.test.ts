import 'fake-indexeddb/auto';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { introducedSince, startOfDay, useDueCounts } from '~/composables/useDueCounts';
import { db } from '~core/db/db';
import type { Item } from '~core/db/schema';
import { saveSettings } from '~core/db/settings';
import type { ItemState } from '~core/srs';
import { seedStarterDeck } from '../helpers/starterDeck';

const NOW = Date.parse('2026-09-16T08:00:00Z');
const DAY = 86_400_000;

/** Local midnight of NOW's day, computed independently of `startOfDay`. */
function localMidnight(at: number): number {
  const d = new Date(at);
  return new Date(d.getFullYear(), d.getMonth(), d.getDate()).getTime();
}

beforeEach(async () => {
  // `useDueCounts()` fires its own `refresh()` against `Date.now()` the
  // moment it is called. Pinning the clock to NOW makes that initial load
  // compute exactly what the test's own `refresh(NOW)` does, so whichever of
  // the two lands last, the counts are the same.
  vi.useFakeTimers({ toFake: ['Date'], now: NOW });
  await db.delete();
  await db.open();
  await seedStarterDeck(NOW);
});

afterEach(() => {
  vi.useRealTimers();
});

/** The seed's recognition items — what Review counts. */
async function seededItems(): Promise<Item[]> {
  return (await db.items.orderBy('id').toArray()).filter((i) => i.dir === 'recognition');
}

/** Writes a review-log row for `item` as if it had been graded at `at` from `before`. */
async function logReview(item: Item, at: number, before: ItemState): Promise<void> {
  await db.reviews.put({
    id: crypto.randomUUID(),
    itemId: item.id,
    grade: 3,
    reviewedAt: at,
    durationMs: 0,
    before: { ...item, state: before },
  });
}

/**
 * Introduces `item`: logs its first review (from `'new'`) at `at` and moves
 * it out of `'new'`, not due again until tomorrow — so it neither shows up
 * in `fresh()` nor in `due()` for NOW.
 */
async function introduce(item: Item, at: number): Promise<void> {
  await logReview(item, at, 'new');
  await db.items.put({ ...item, state: 'learning', due: NOW + DAY, reps: 1 });
}

async function setState(item: Item, state: ItemState, due: number): Promise<void> {
  await db.items.put({ ...item, state, due, reps: 1 });
}

describe('startOfDay', () => {
  it('is local midnight of the same day', () => {
    const midnight = localMidnight(NOW);
    expect(startOfDay(NOW)).toBe(midnight);
    expect(startOfDay(midnight)).toBe(midnight);
    expect(startOfDay(midnight - 1)).toBe(localMidnight(midnight - 1));
    expect(startOfDay(midnight - 1)).toBeLessThan(midnight);
  });
});

describe('introducedSince', () => {
  it('counts one direction only when asked to', async () => {
    const all = await db.items.orderBy('id').toArray();
    const recognition = all.find((i) => i.dir === 'recognition')!;
    const production = all.find((i) => i.dir === 'production')!;
    await logReview(recognition, NOW, 'new');
    await logReview(production, NOW, 'new');
    expect(await introducedSince(startOfDay(NOW), 'recognition')).toBe(1);
    expect(await introducedSince(startOfDay(NOW), 'production')).toBe(1);
    expect(await introducedSince(startOfDay(NOW))).toBe(2);
  });

  it('counts only reviews whose item was new beforehand', async () => {
    const [a, b, c] = await seededItems();
    await logReview(a!, NOW, 'new');
    await logReview(b!, NOW, 'learning');
    await logReview(c!, NOW, 'review');
    expect(await introducedSince(startOfDay(NOW))).toBe(1);
  });

  it('counts an item once however many of its rows say new', async () => {
    const [a] = await seededItems();
    await logReview(a!, NOW - 1000, 'new');
    await logReview(a!, NOW, 'new');
    expect(await introducedSince(startOfDay(NOW))).toBe(1);
  });

  it('includes a review at exactly `since` and excludes one a millisecond before', async () => {
    const [a, b] = await seededItems();
    const since = startOfDay(NOW);
    await logReview(a!, since, 'new');
    await logReview(b!, since - 1, 'new');
    expect(await introducedSince(since)).toBe(1);
  });
});

describe('useDueCounts().refresh', () => {
  it('offers only what is left of the daily new-card allowance', async () => {
    await saveSettings({ newPerDay: 5 });
    const all = await seededItems();
    await introduce(all[0]!, NOW - 1000);
    await introduce(all[1]!, NOW - 500);
    // A review of an already-introduced item today does not spend allowance.
    await logReview(all[2]!, NOW - 100, 'review');

    const { counts, refresh } = useDueCounts();
    await refresh(NOW);
    expect(counts.value.review.fresh).toBe(3);
    expect(counts.value.review.total).toBe(3);
  });

  it('offers no new cards once more than the allowance was introduced today', async () => {
    await saveSettings({ newPerDay: 1 });
    const all = await seededItems();
    for (const item of all.slice(0, 3)) await introduce(item, NOW - 1000);

    const { counts, refresh } = useDueCounts();
    await refresh(NOW);
    expect(counts.value.review.fresh).toBe(0);
  });

  it('does not count yesterday’s introductions against today', async () => {
    await saveSettings({ newPerDay: 5 });
    const all = await seededItems();
    const lastNight = startOfDay(NOW) - 1;
    await introduce(all[0]!, lastNight);
    await introduce(all[1]!, lastNight);

    const { counts, refresh } = useDueCounts();
    await refresh(NOW);
    expect(counts.value.review.fresh).toBe(5);
  });

  it('counts relearning items as learning, and totals due plus fresh', async () => {
    await saveSettings({ newPerDay: 0 });
    const all = await seededItems();
    await setState(all[0]!, 'learning', NOW - 1000);
    await setState(all[1]!, 'relearning', NOW - 1000);
    await setState(all[2]!, 'review', NOW - 1000);
    await setState(all[3]!, 'review', NOW + DAY); // not due yet

    const { counts, refresh } = useDueCounts();
    await refresh(NOW);
    expect(counts.value.review).toEqual({ total: 3, fresh: 0, learning: 2, review: 1 });
  });

  it('keeps each direction to its own allowance and its own due items', async () => {
    await saveSettings({ newPerDay: 3 });
    const recognition = await seededItems();
    await introduce(recognition[0]!, NOW - 1000);
    await introduce(recognition[1]!, NOW - 1000);
    await setState(recognition[2]!, 'review', NOW - 1000);

    const { counts, refresh } = useDueCounts();
    await refresh(NOW);
    // Two of Review's three introductions are spent; Writing's are not.
    expect(counts.value.review).toEqual({ total: 2, fresh: 1, learning: 0, review: 1 });
    expect(counts.value.writing).toEqual({ total: 3, fresh: 3, learning: 0, review: 0 });
  });
});
