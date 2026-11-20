import 'fake-indexeddb/auto';
import { beforeEach, describe, expect, it } from 'vitest';
import { db } from '~core/db/db';
import { attempts, cards, decks, items, reviews } from '~core/db/repositories';
import { type WritingResult, SELF_GRADED, itemId } from '~core/db/schema';

const NOW = Date.parse('2026-09-16T08:00:00Z');

const aDeck = { id: 'd1', name: 'HSK 1', description: '', colorToken: 'var(--chart-series-1)', tag: '', bundle: 'taiwan' as const, translationLang: 'en', createdAt: NOW, updatedAt: NOW, deletedAt: null };
const aCard = { id: 'c1', deckId: 'd1', hanzi: '十', pinyin: [{ text: 'shí', tone: 2 as const }], zhuyin: '', translation: 'ten', pos: 'noun' as const, example: '', examplePinyin: '', exampleTranslation: '', tags: [], note: '', createdAt: NOW, updatedAt: NOW, deletedAt: null };
const WRITING: WritingResult[] = [{ character: '十', shapeCorrect: true, orderCorrect: false, error: 'stroke-order', strokeIndex: 0, expected: 2, drawn: 2 }];

beforeEach(async () => {
  await db.delete();
  await db.open();
  await decks.put(aDeck);
  await cards.create(aCard, ['recognition', 'production'], NOW);
});

async function production() {
  return (await items.get(itemId('c1', 'production')))!;
}

describe('reviews.record', () => {
  it('writes an attempt with the review, under the same id', async () => {
    const item = await production();
    const id = await reviews.record({ item, before: item, grade: 3, reviewedAt: NOW, durationMs: 4000, detail: { checked: true, writing: WRITING } });
    expect(await db.attempts.get(id)).toEqual({
      id, itemId: item.id, cardId: 'c1', deckId: 'd1', mode: 'writing', source: 'scheduled',
      grade: 3, correct: true, at: NOW, durationMs: 4000, checked: true, writing: WRITING,
    });
    expect((await db.outbox.toArray()).filter((e) => e.entity === 'attempt').map((e) => e.entityId)).toEqual([id]);
  });

  it('records a self-graded answer when no detail is given', async () => {
    const item = (await items.get(itemId('c1', 'recognition')))!;
    const id = await reviews.record({ item, before: item, grade: 1, reviewedAt: NOW, durationMs: 1000 });
    expect(await db.attempts.get(id)).toMatchObject({ mode: 'review', correct: false, ...SELF_GRADED });
  });
});

describe('reviews.undo', () => {
  it('deletes the attempt with the review', async () => {
    const item = await production();
    const id = await reviews.record({ item, before: item, grade: 3, reviewedAt: NOW, durationMs: 1000 });
    await reviews.undo(id);
    expect(await db.attempts.get(id)).toBeUndefined();
    expect((await db.outbox.toArray()).some((e) => e.entity === 'attempt' && e.op === 'delete' && e.entityId === id)).toBe(true);
  });
});

describe('attempts.log', () => {
  it('logs a practice answer without touching items or reviews', async () => {
    const item = await production();
    const id = await attempts.log({ item, grade: 1, at: NOW, durationMs: 2000, detail: { checked: true, writing: WRITING } });
    expect(await db.attempts.get(id)).toMatchObject({ source: 'practice', mode: 'writing', correct: false, deckId: 'd1' });
    expect(await db.reviews.count()).toBe(0);
    expect(await production()).toEqual(item);
  });
});

describe('attempts.forCard', () => {
  it('returns every answer on the card, oldest first', async () => {
    const item = await production();
    await attempts.log({ item, grade: 3, at: NOW + 10, durationMs: 1, detail: SELF_GRADED });
    await attempts.log({ item, grade: 1, at: NOW, durationMs: 1, detail: SELF_GRADED });
    expect((await attempts.forCard('c1')).map((a) => a.at)).toEqual([NOW, NOW + 10]);
  });
});
