import 'fake-indexeddb/auto';
import { beforeEach, describe, expect, it } from 'vitest';
import { db } from '~core/db/db';
import { DECK_COLORS, cards, decks, items, reviews } from '~core/db/repositories';
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

describe('decks.create', () => {
  it('creates a deck with an outbox entry in the same transaction', async () => {
    const deck = await decks.create({ name: 'HSK 2', description: 'second level', colorToken: DECK_COLORS[1], tag: 'HSK' }, NOW);
    expect(deck).toMatchObject({ name: 'HSK 2', description: 'second level', colorToken: DECK_COLORS[1], tag: 'HSK' });
    expect(await decks.get(deck.id)).toMatchObject({ name: 'HSK 2' });
    const pending = await db.outbox.toArray();
    expect(pending.some((e) => e.entity === 'deck' && e.entityId === deck.id)).toBe(true);
  });

  it('rejects a colorToken outside DECK_COLORS', async () => {
    await expect(
      decks.create({ name: 'x', description: '', colorToken: 'red' as never, tag: '' }, NOW),
    ).rejects.toThrow();
  });
});

describe('decks.update', () => {
  it('updates the named fields and writes an outbox entry', async () => {
    await decks.put(aDeck());
    await decks.update('d1', { name: 'HSK 1 renamed', tag: 'HSK-new' }, NOW + 1);
    expect(await decks.get('d1')).toMatchObject({ name: 'HSK 1 renamed', tag: 'HSK-new', updatedAt: NOW + 1 });
    const pending = await db.outbox.toArray();
    expect(pending.filter((e) => e.entity === 'deck' && e.entityId === 'd1').length).toBeGreaterThan(0);
  });

  it('rejects a colorToken outside DECK_COLORS', async () => {
    await decks.put(aDeck());
    await expect(decks.update('d1', { colorToken: 'not-a-token' }, NOW)).rejects.toThrow();
    expect((await decks.get('d1'))!.colorToken).toBe('var(--chart-series-1)');
  });

  it('does not erase colorToken when the patch carries it as an explicit undefined key', async () => {
    await decks.put(aDeck());
    await decks.update('d1', { colorToken: undefined, name: 'x' }, NOW);
    expect((await decks.get('d1'))!).toMatchObject({ colorToken: 'var(--chart-series-1)', name: 'x' });
  });
});

describe('decks.softDelete', () => {
  it('marks the deck deleted and hides its cards from due/fresh/visible through existing deck visibility', async () => {
    await decks.put(aDeck());
    await cards.create(aCard(), ['recognition'], NOW);
    const id = itemId('c1', 'recognition');
    await items.put({ ...(await items.get(id))!, state: 'review', due: NOW - DAY });

    await decks.softDelete('d1', NOW);

    expect((await decks.get('d1'))!.deletedAt).toBe(NOW);
    expect(await items.due(NOW)).toEqual([]);
    expect(await items.fresh(10)).toEqual([]);
    expect(await items.visible([id])).toEqual([]);
  });
});

describe('decks.summaries', () => {
  it('counts total (cards, not items), due, fresh, mature and young', async () => {
    await decks.put(aDeck());
    // c1: two directions, one due-review (young, scheduledDays 5), one fresh/new
    await cards.create(aCard({ id: 'c1' }), ['recognition', 'production'], NOW);
    await items.put({ ...(await items.get(itemId('c1', 'recognition')))!, state: 'review', due: NOW - DAY, scheduledDays: 5 });
    // c2: one mature item (review, scheduledDays 30), not due yet
    await cards.create(aCard({ id: 'c2' }), ['recognition'], NOW);
    await items.put({ ...(await items.get(itemId('c2', 'recognition')))!, state: 'review', due: NOW + DAY, scheduledDays: 30 });
    // c3: suspended item only -> excluded from every count
    await cards.create(aCard({ id: 'c3' }), ['recognition'], NOW);
    await items.put({ ...(await items.get(itemId('c3', 'recognition')))!, state: 'review', due: NOW - DAY, suspended: true });

    const summary = (await decks.summaries(NOW))[0]!;
    expect(summary.deck.id).toBe('d1');
    expect(summary.total).toBe(3);
    expect(summary.due).toBe(1); // c1 recognition only
    expect(summary.fresh).toBe(1); // c1 production, still new
    expect(summary.mature).toBe(1); // c2
    expect(summary.young).toBe(1); // c1 recognition (review, not mature)
  });

  it('excludes soft-deleted cards and soft-deleted decks', async () => {
    await decks.put(aDeck());
    await decks.put(aDeck({ id: 'd2' }));
    await cards.create(aCard({ id: 'c1' }), ['recognition'], NOW);
    await cards.create(aCard({ id: 'c2' }), ['recognition'], NOW);
    await db.cards.put({ ...(await cards.get('c2'))!, deletedAt: NOW });
    await decks.put({ ...(await decks.get('d2'))!, deletedAt: NOW });

    const summaries = await decks.summaries(NOW);
    expect(summaries.map((s) => s.deck.id)).toEqual(['d1']);
    expect(summaries[0]!.total).toBe(1);
  });
});

describe('cards.update', () => {
  it('applies a patch to the named fields', async () => {
    await decks.put(aDeck());
    await cards.create(aCard(), ['recognition'], NOW);
    await cards.update('c1', { translation: 'to learn', note: 'HSK1' }, ['recognition'], NOW + 1);
    expect(await cards.get('c1')).toMatchObject({ translation: 'to learn', note: 'HSK1', updatedAt: NOW + 1 });
  });

  it('recomputes zhuyin from the new pinyin when the patch changes pinyin and gives no zhuyin', async () => {
    await decks.put(aDeck());
    await cards.create(aCard({ zhuyin: 'old' }), ['recognition'], NOW);
    await cards.update('c1', { pinyin: [{ text: 'xué', tone: 2 }, { text: 'xí', tone: 2 }] }, ['recognition'], NOW + 1);
    expect((await cards.get('c1'))!.zhuyin).toBe('ㄒㄩㄝˊ ㄒㄧˊ');
  });

  it('does not recompute zhuyin when the patch gives one explicitly', async () => {
    await decks.put(aDeck());
    await cards.create(aCard({ zhuyin: 'old' }), ['recognition'], NOW);
    await cards.update('c1', { pinyin: [{ text: 'xué', tone: 2 }], zhuyin: 'custom' }, ['recognition'], NOW + 1);
    expect((await cards.get('c1'))!.zhuyin).toBe('custom');
  });

  it('does not recompute zhuyin when the patch pinyin is unchanged from the stored value', async () => {
    await decks.put(aDeck());
    // aCard()'s default pinyin is [{ text: 'xué', tone: 2 }] — the patch below
    // sends the same syllables back, so nothing about the pinyin actually
    // changed, and a hand-set zhuyin must survive untouched.
    await cards.create(aCard({ zhuyin: 'hand-set' }), ['recognition'], NOW);
    await cards.update('c1', { pinyin: [{ text: 'xué', tone: 2 }] }, ['recognition'], NOW + 1);
    expect((await cards.get('c1'))!.zhuyin).toBe('hand-set');
  });

  it('suspends a disabled direction and keeps its review history, then un-suspends the same item on re-enable', async () => {
    await decks.put(aDeck());
    await cards.create(aCard(), ['recognition', 'production'], NOW);
    const prodId = itemId('c1', 'production');
    const reviewId = await reviews.record({
      item: (await items.get(prodId))!,
      before: newSrsState(NOW),
      grade: 3,
      reviewedAt: NOW,
      durationMs: 1000,
    });

    await cards.update('c1', {}, ['recognition'], NOW + 1); // drop production
    const afterDisable = (await items.get(prodId))!;
    expect(afterDisable.suspended).toBe(true);
    expect(await db.items.count()).toBe(2); // still just the 2 original items, none deleted
    expect((await reviews.historyForCard('c1')).map((r) => r.id)).toContain(reviewId);

    await cards.update('c1', {}, ['recognition', 'production'], NOW + 2); // re-enable
    const afterReenable = (await items.get(prodId))!;
    expect(afterReenable.suspended).toBe(false);
    expect(await db.items.count()).toBe(2); // same item, not duplicated
    expect((await reviews.historyForCard('c1')).map((r) => r.id)).toContain(reviewId);
  });

  it('gives a newly enabled direction with no prior item a fresh item', async () => {
    await decks.put(aDeck());
    await cards.create(aCard(), ['recognition'], NOW);
    await cards.update('c1', {}, ['recognition', 'production'], NOW + 1);
    const prod = await items.get(itemId('c1', 'production'));
    expect(prod).toMatchObject({ state: 'new', suspended: false });
  });

  it('throws when the directions array is empty', async () => {
    await decks.put(aDeck());
    await cards.create(aCard(), ['recognition'], NOW);
    await expect(cards.update('c1', {}, [], NOW)).rejects.toThrow();
  });

  it('leaves every item untouched when directions is null, suspended or not', async () => {
    await decks.put(aDeck());
    await cards.create(aCard(), ['recognition', 'production'], NOW);
    await items.setSuspended([itemId('c1', 'recognition'), itemId('c1', 'production')], true, NOW);
    const itemsBefore = await db.items.toArray();

    await cards.update('c1', { translation: 'to learn' }, null, NOW + 1);

    expect((await cards.get('c1'))!.translation).toBe('to learn');
    expect(await db.items.toArray()).toEqual(itemsBefore);
    // Only the card's own outbox entry — no item was written.
    const added = (await db.outbox.toArray()).filter((e) => e.at === NOW + 1);
    expect(added.map((e) => e.entity)).toEqual(['card']);
  });

  it('creates no item for a missing direction when directions is null', async () => {
    await decks.put(aDeck());
    await cards.create(aCard(), ['recognition'], NOW);
    await cards.update('c1', { note: 'x' }, null, NOW + 1);
    expect(await items.get(itemId('c1', 'production'))).toBeUndefined();
  });

  it('moves a card to a live deck via a deckId patch, with an outbox entry — proving db.decks is reachable inside the transaction', async () => {
    await decks.put(aDeck());
    await decks.put(aDeck({ id: 'd2', name: 'HSK 2' }));
    await cards.create(aCard(), ['recognition'], NOW);
    const before = (await db.outbox.toArray()).length;

    await cards.update('c1', { deckId: 'd2' }, ['recognition'], NOW + 1);

    expect((await cards.get('c1'))!.deckId).toBe('d2');
    const pending = await db.outbox.toArray();
    expect(pending.length).toBeGreaterThan(before);
    expect(pending.some((e) => e.entity === 'card' && e.entityId === 'c1')).toBe(true);
  });

  it('throws a specific message when the deckId patch points at a soft-deleted deck', async () => {
    await decks.put(aDeck());
    await decks.put(aDeck({ id: 'd2', deletedAt: NOW }));
    await cards.create(aCard(), ['recognition'], NOW);
    await expect(cards.update('c1', { deckId: 'd2' }, ['recognition'], NOW)).rejects.toThrow('no such deck: d2');
  });

  it('throws a specific message when the deckId patch points at an unknown deck', async () => {
    await decks.put(aDeck());
    await cards.create(aCard(), ['recognition'], NOW);
    await expect(cards.update('c1', { deckId: 'no-such-deck' }, ['recognition'], NOW)).rejects.toThrow('no such deck: no-such-deck');
  });

  it('does not erase a required field when the patch carries it as an explicit undefined key', async () => {
    await decks.put(aDeck());
    await cards.create(aCard(), ['recognition'], NOW);
    await cards.update('c1', { hanzi: undefined, translation: 'to learn' }, ['recognition'], NOW + 1);
    expect((await cards.get('c1'))!).toMatchObject({ hanzi: '學習', translation: 'to learn' });
  });
});

describe('cards.softDelete', () => {
  it('soft-deletes every id in one transaction, one outbox entry each', async () => {
    await decks.put(aDeck());
    await cards.create(aCard({ id: 'c1' }), ['recognition'], NOW);
    await cards.create(aCard({ id: 'c2' }), ['recognition'], NOW);

    const before = (await db.outbox.toArray()).length;
    await cards.softDelete(['c1', 'c2'], NOW);

    expect((await cards.get('c1'))!.deletedAt).toBe(NOW);
    expect((await cards.get('c2'))!.deletedAt).toBe(NOW);
    expect((await db.outbox.toArray()).length).toBe(before + 2);
  });
});

describe('cards.move', () => {
  it('moves a card to another deck; it appears under the new deck summary and not the old', async () => {
    await decks.put(aDeck());
    await decks.put(aDeck({ id: 'd2', name: 'HSK 2' }));
    await cards.create(aCard(), ['recognition'], NOW);

    await cards.move(['c1'], 'd2', NOW + 1);

    expect((await cards.get('c1'))!.deckId).toBe('d2');
    const summaries = await decks.summaries(NOW + 1);
    const d1 = summaries.find((s) => s.deck.id === 'd1')!;
    const d2 = summaries.find((s) => s.deck.id === 'd2')!;
    expect(d1.total).toBe(0);
    expect(d2.total).toBe(1);
  });

  it('throws when the target deck is soft-deleted, and moves nothing', async () => {
    await decks.put(aDeck());
    await decks.put(aDeck({ id: 'd2', deletedAt: NOW }));
    await cards.create(aCard(), ['recognition'], NOW);

    await expect(cards.move(['c1'], 'd2', NOW)).rejects.toThrow();
    expect((await cards.get('c1'))!.deckId).toBe('d1');
  });

  it('throws when the target deck is unknown', async () => {
    await decks.put(aDeck());
    await cards.create(aCard(), ['recognition'], NOW);
    await expect(cards.move(['c1'], 'no-such-deck', NOW)).rejects.toThrow();
  });

  it('skips a card whose hanzi the target deck already has, and reports both counts', async () => {
    await decks.put(aDeck());
    await decks.put(aDeck({ id: 'd2', name: 'HSK 2' }));
    await cards.create(aCard({ id: 'c1', hanzi: '學習' }), ['recognition'], NOW);
    await cards.create(aCard({ id: 'c2', hanzi: '你好' }), ['recognition'], NOW);
    await cards.create(aCard({ id: 'c3', deckId: 'd2', hanzi: ' 學習 ' }), ['recognition'], NOW);

    const result = await cards.move(['c1', 'c2'], 'd2', NOW + 1);

    expect(result).toEqual({ moved: 1, skipped: 1 });
    expect((await cards.get('c1'))!.deckId).toBe('d1');
    expect((await cards.get('c2'))!.deckId).toBe('d2');
    const entries = (await db.outbox.toArray()).filter((e) => e.at === NOW + 1);
    expect(entries.map((e) => e.entityId)).toEqual(['c2']);
  });

  it('moves only the first of two moved cards sharing a hanzi', async () => {
    await decks.put(aDeck());
    await decks.put(aDeck({ id: 'd2', name: 'HSK 2' }));
    await decks.put(aDeck({ id: 'd3', name: 'HSK 3' }));
    await cards.create(aCard({ id: 'c1', hanzi: '學習' }), ['recognition'], NOW);
    await cards.create(aCard({ id: 'c2', deckId: 'd2', hanzi: '學習' }), ['recognition'], NOW);

    const result = await cards.move(['c1', 'c2'], 'd3', NOW + 1);

    expect(result).toEqual({ moved: 1, skipped: 1 });
    expect((await cards.get('c1'))!.deckId).toBe('d3');
    expect((await cards.get('c2'))!.deckId).toBe('d2');
    const entries = (await db.outbox.toArray()).filter((e) => e.at === NOW + 1);
    expect(entries.map((e) => e.entityId)).toEqual(['c1']);
  });

  it('ignores a soft-deleted card in the target deck when checking duplicates', async () => {
    await decks.put(aDeck());
    await decks.put(aDeck({ id: 'd2', name: 'HSK 2' }));
    await cards.create(aCard({ id: 'c1', hanzi: '學習' }), ['recognition'], NOW);
    await cards.create(aCard({ id: 'c2', deckId: 'd2', hanzi: '學習', deletedAt: NOW }), ['recognition'], NOW);

    expect(await cards.move(['c1'], 'd2', NOW + 1)).toEqual({ moved: 1, skipped: 0 });
    expect((await cards.get('c1'))!.deckId).toBe('d2');
  });
});

describe('cards.list', () => {
  async function setUp() {
    await decks.put(aDeck());
    await decks.put(aDeck({ id: 'd2', name: 'HSK 2' }));
    await cards.create(
      aCard({ id: 'c1', hanzi: '學習', translation: 'to study', pinyin: [{ text: 'xué', tone: 2 }, { text: 'xí', tone: 2 }] }),
      ['recognition', 'production'],
      NOW,
    );
    await cards.create(
      aCard({ id: 'c2', deckId: 'd2', hanzi: '你好', translation: 'hello', pinyin: [{ text: 'nǐ', tone: 3 }, { text: 'hǎo', tone: 3 }] }),
      ['recognition'],
      NOW,
    );
  }

  it('filters by deckId', async () => {
    await setUp();
    const rows = await cards.list({ deckId: 'd2', now: NOW });
    expect(rows.map((r) => r.card.id)).toEqual(['c2']);
  });

  it('filters by state, treating every-item-suspended as the suspended state', async () => {
    await setUp();
    await items.setSuspended([itemId('c1', 'recognition'), itemId('c1', 'production')], true, NOW);
    const rows = await cards.list({ state: 'suspended', now: NOW });
    expect(rows.map((r) => r.card.id)).toEqual(['c1']);
    const newRows = await cards.list({ state: 'new', now: NOW });
    expect(newRows.map((r) => r.card.id)).toEqual(['c2']);
  });

  it('filters by dir, matching only cards with an unsuspended item in that direction', async () => {
    await setUp();
    const rows = await cards.list({ dir: 'production', now: NOW });
    expect(rows.map((r) => r.card.id)).toEqual(['c1']);
  });

  it('matches query against hanzi, translation and toneless pinyin, case-insensitively', async () => {
    await setUp();
    expect((await cards.list({ query: '學習', now: NOW })).map((r) => r.card.id)).toEqual(['c1']);
    expect((await cards.list({ query: 'STUDY', now: NOW })).map((r) => r.card.id)).toEqual(['c1']);
    expect((await cards.list({ query: 'xuexi', now: NOW })).map((r) => r.card.id)).toEqual(['c1']);
    expect((await cards.list({ query: '  xuexi  ', now: NOW })).map((r) => r.card.id)).toEqual(['c1']);
  });

  it('treats an empty (or all-whitespace) query as no filter', async () => {
    await setUp();
    expect((await cards.list({ query: '   ', now: NOW })).map((r) => r.card.id).sort()).toEqual(['c1', 'c2']);
  });

  it('combines deckId, state, dir and query with AND', async () => {
    await setUp();
    const rows = await cards.list({ deckId: 'd1', dir: 'recognition', query: 'xuexi', now: NOW });
    expect(rows.map((r) => r.card.id)).toEqual(['c1']);
    const none = await cards.list({ deckId: 'd2', dir: 'recognition', query: 'xuexi', now: NOW });
    expect(none).toEqual([]);
  });

  it('excludes soft-deleted cards', async () => {
    await setUp();
    await cards.softDelete(['c1'], NOW);
    expect((await cards.list({ now: NOW })).map((r) => r.card.id)).toEqual(['c2']);
  });
});

describe('items.setSuspended', () => {
  it('suspends and un-suspends the given ids with one outbox entry each', async () => {
    await decks.put(aDeck());
    await cards.create(aCard(), ['recognition', 'production'], NOW);
    const ids = [itemId('c1', 'recognition'), itemId('c1', 'production')];
    const before = (await db.outbox.toArray()).length;

    await items.setSuspended(ids, true, NOW + 1);
    expect((await items.get(ids[0]!))!.suspended).toBe(true);
    expect((await items.get(ids[1]!))!.suspended).toBe(true);
    expect((await db.outbox.toArray()).length).toBe(before + 2);

    await items.setSuspended(ids, false, NOW + 2);
    expect((await items.get(ids[0]!))!.suspended).toBe(false);
    expect((await db.outbox.toArray()).length).toBe(before + 4);
  });
});

describe('reviews.historyForCard', () => {
  it('returns reviews across every direction of a card, oldest first', async () => {
    await decks.put(aDeck());
    await cards.create(aCard(), ['recognition', 'production'], NOW);
    const recId = itemId('c1', 'recognition');
    const prodId = itemId('c1', 'production');
    const r1 = await reviews.record({ item: (await items.get(prodId))!, before: newSrsState(NOW), grade: 3, reviewedAt: NOW + 20, durationMs: 100 });
    const r2 = await reviews.record({ item: (await items.get(recId))!, before: newSrsState(NOW), grade: 2, reviewedAt: NOW + 10, durationMs: 100 });

    const history = await reviews.historyForCard('c1');
    expect(history.map((r) => r.id)).toEqual([r2, r1]);
  });
});
