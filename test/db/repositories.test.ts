import 'fake-indexeddb/auto';
import { beforeEach, describe, expect, it } from 'vitest';
import { db } from '~core/db/db';
import { cards, decks, items, reviews } from '~core/db/repositories';
import { itemId } from '~core/db/schema';
import { newSrsState } from '~core/srs';

const NOW = Date.parse('2026-09-16T08:00:00Z');
const DAY = 86_400_000;

const aDeck = (over = {}) => ({
  id: 'd1', name: 'HSK 1', description: '', colorToken: 'var(--chart-series-1)',
  tag: 'HSK', translationLang: 'en', createdAt: NOW, updatedAt: NOW, deletedAt: null, ...over,
});

const aCard = (over = {}) => ({
  id: 'c1', deckId: 'd1', hanzi: '學習', pinyin: [{ text: 'xué', tone: 2 as const }],
  zhuyin: '', translation: 'to study', pos: 'verb' as const, example: '', examplePinyin: '',
  exampleTranslation: '', tags: [], note: '', createdAt: NOW, updatedAt: NOW, deletedAt: null, ...over,
});

beforeEach(async () => {
  await db.delete();
  await db.open();
});

describe('decks', () => {
  it('stores and reads a deck back', async () => {
    await decks.put(aDeck());
    expect(await decks.get('d1')).toMatchObject({ name: 'HSK 1' });
  });

  it('hides soft-deleted decks from listAll', async () => {
    await decks.put(aDeck());
    await decks.put(aDeck({ id: 'd2', deletedAt: NOW }));
    expect((await decks.listAll()).map((d) => d.id)).toEqual(['d1']);
  });
});

describe('cards', () => {
  it('creates one item per requested direction', async () => {
    await decks.put(aDeck());
    await cards.create(aCard(), ['recognition', 'production'], NOW);
    const made = await items.forCard('c1');
    expect(made.map((i) => i.dir).sort()).toEqual(['production', 'recognition']);
    expect(made.every((i) => i.state === 'new')).toBe(true);
  });

  it('writes an outbox entry in the same transaction', async () => {
    await decks.put(aDeck());
    await cards.create(aCard(), ['recognition'], NOW);
    const pending = await db.outbox.toArray();
    expect(pending.some((e) => e.entity === 'card' && e.entityId === 'c1')).toBe(true);
  });
});

describe('items', () => {
  it('returns only items that are due, not suspended, and not new', async () => {
    await decks.put(aDeck());
    await cards.create(aCard(), ['recognition'], NOW);
    const id = itemId('c1', 'recognition');
    await items.put({ ...(await items.get(id))!, state: 'review', due: NOW - DAY });
    await cards.create(aCard({ id: 'c2' }), ['recognition'], NOW);
    const later = itemId('c2', 'recognition');
    await items.put({ ...(await items.get(later))!, state: 'review', due: NOW + DAY });

    const due = await items.due(NOW);
    expect(due.map((i) => i.id)).toEqual([id]);
  });

  it('excludes suspended items from due', async () => {
    await decks.put(aDeck());
    await cards.create(aCard(), ['recognition'], NOW);
    const id = itemId('c1', 'recognition');
    await items.put({ ...(await items.get(id))!, state: 'review', due: NOW - DAY, suspended: true });
    expect(await items.due(NOW)).toEqual([]);
  });

  it('returns new items separately, oldest card first', async () => {
    await decks.put(aDeck());
    await cards.create(aCard({ id: 'c2', createdAt: NOW + 10 }), ['recognition'], NOW);
    await cards.create(aCard({ id: 'c1', createdAt: NOW }), ['recognition'], NOW);
    const fresh = await items.fresh(10);
    expect(fresh.map((i) => i.cardId)).toEqual(['c1', 'c2']);
  });

  it('excludes an item whose card is soft-deleted from due', async () => {
    await decks.put(aDeck());
    await cards.create(aCard(), ['recognition'], NOW);
    const id = itemId('c1', 'recognition');
    await items.put({ ...(await items.get(id))!, state: 'review', due: NOW - DAY });
    await db.cards.put({ ...(await cards.get('c1'))!, deletedAt: NOW });
    expect(await items.due(NOW)).toEqual([]);
  });

  it('excludes an item whose card is soft-deleted from fresh', async () => {
    await decks.put(aDeck());
    await cards.create(aCard(), ['recognition'], NOW);
    await db.cards.put({ ...(await cards.get('c1'))!, deletedAt: NOW });
    expect(await items.fresh(10)).toEqual([]);
  });

  it('excludes an item whose deck is soft-deleted from due, even though the card itself is not', async () => {
    await decks.put(aDeck());
    await cards.create(aCard(), ['recognition'], NOW);
    const id = itemId('c1', 'recognition');
    await items.put({ ...(await items.get(id))!, state: 'review', due: NOW - DAY });
    await decks.put({ ...(await decks.get('d1'))!, deletedAt: NOW });
    expect(await items.due(NOW)).toEqual([]);
  });

  it('excludes an item whose deck is soft-deleted from fresh, even though the card itself is not', async () => {
    await decks.put(aDeck());
    await cards.create(aCard(), ['recognition'], NOW);
    await decks.put({ ...(await decks.get('d1'))!, deletedAt: NOW });
    expect(await items.fresh(10)).toEqual([]);
  });

  it('visible() preserves the given order and drops suspended items and items whose card or deck is soft-deleted', async () => {
    await decks.put(aDeck());
    await decks.put(aDeck({ id: 'd2' }));
    await cards.create(aCard(), ['recognition'], NOW); // c1, deck d1, stays visible
    await cards.create(aCard({ id: 'c2', deckId: 'd2' }), ['recognition'], NOW); // suspended
    await cards.create(aCard({ id: 'c3' }), ['recognition'], NOW); // card soft-deleted
    await cards.create(aCard({ id: 'c4', deckId: 'd2' }), ['recognition'], NOW); // deck soft-deleted
    await cards.create(aCard({ id: 'c5' }), ['recognition'], NOW); // deck d1, stays visible
    const id1 = itemId('c1', 'recognition');
    const id2 = itemId('c2', 'recognition');
    const id3 = itemId('c3', 'recognition');
    const id4 = itemId('c4', 'recognition');
    const id5 = itemId('c5', 'recognition');

    await items.put({ ...(await items.get(id2))!, suspended: true });
    await db.cards.put({ ...(await cards.get('c3'))!, deletedAt: NOW });
    await decks.put({ ...(await decks.get('d2'))!, deletedAt: NOW });

    // Deliberately not in creation order, and includes an id that never
    // existed at all, to prove both the ordering and the "row missing"
    // case, not just the visibility rules. The two survivors (id5, id1)
    // must come back in this given order, not creation order, to prove
    // ordering is actually preserved rather than coincidental.
    const result = await items.visible([id4, id5, id3, 'no-such-item', id2, id1]);
    expect(result.map((i) => i.id)).toEqual([id5, id1]);
  });
});

describe('reviews', () => {
  it('records a review and updates the item in one transaction', async () => {
    await decks.put(aDeck());
    await cards.create(aCard(), ['recognition'], NOW);
    const id = itemId('c1', 'recognition');
    const before = (await items.get(id))!;
    const after = { ...before, state: 'learning' as const, due: NOW + 600_000, reps: 1 };

    await reviews.record({ item: after, before: newSrsState(NOW), grade: 3, reviewedAt: NOW, durationMs: 4200 });

    expect((await items.get(id))!.reps).toBe(1);
    expect(await db.reviews.count()).toBe(1);
  });

  it('undoes a review exactly, restoring the previous state', async () => {
    await decks.put(aDeck());
    await cards.create(aCard(), ['recognition'], NOW);
    const id = itemId('c1', 'recognition');
    const before = (await items.get(id))!;
    const after = { ...before, state: 'learning' as const, due: NOW + 600_000, reps: 1, stability: 2.3 };

    const reviewId = await reviews.record({ item: after, before, grade: 3, reviewedAt: NOW, durationMs: 1000 });
    await reviews.undo(reviewId);

    expect(await items.get(id)).toEqual(before);
    expect(await db.reviews.count()).toBe(0);
  });

  it('undoes correctly even when record() was given a bare SrsState as before, not a full Item', async () => {
    await decks.put(aDeck());
    await cards.create(aCard(), ['recognition'], NOW);
    const id = itemId('c1', 'recognition');
    const before = (await items.get(id))!; // updatedAt: NOW, lastReview: null
    const laterReviewedAt = NOW + 5000; // deliberately different from before.updatedAt
    const after = { ...before, state: 'learning' as const, due: laterReviewedAt + 600_000, reps: 1 };

    // `before: newSrsState(NOW)` is a bare SrsState, matching the brief's own
    // usage in "records a review and updates the item in one transaction"
    // above — legal per RecordedReview's type, and exactly the shape that
    // let the updatedAt bug through undetected.
    const reviewId = await reviews.record({
      item: after,
      before: newSrsState(NOW),
      grade: 3,
      reviewedAt: laterReviewedAt,
      durationMs: 1000,
    });
    await reviews.undo(reviewId);

    expect(await items.get(id)).toEqual(before);
  });
});
