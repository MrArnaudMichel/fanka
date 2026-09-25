import 'fake-indexeddb/auto';
import { beforeEach, describe, expect, it } from 'vitest';
import { usePracticeSession } from '~/composables/usePracticeSession';
import { db } from '~core/db/db';
import { cards, decks, items } from '~core/db/repositories';
import { saveStudyDeckIds } from '~core/db/study-decks';

const NOW = Date.parse('2026-09-16T08:00:00Z');

const aDeck = (id: string) => ({
  id, name: id, description: '', colorToken: 'var(--chart-series-1)',
  tag: '', translationLang: 'en', createdAt: NOW, updatedAt: NOW, deletedAt: null,
});

const aCard = (id: string, deckId: string) => ({
  id, deckId, hanzi: '學習', pinyin: [{ text: 'xué', tone: 2 as const }],
  zhuyin: '', translation: 'to study', pos: 'verb' as const, example: '', examplePinyin: '',
  exampleTranslation: '', tags: [], note: '', createdAt: NOW, updatedAt: NOW, deletedAt: null,
});

beforeEach(async () => {
  await db.delete();
  await db.open();
  await decks.put(aDeck('d1'));
  await decks.put(aDeck('d2'));
  await cards.create(aCard('a', 'd1'), ['recognition', 'production'], NOW);
  await cards.create(aCard('b', 'd1'), ['recognition', 'production'], NOW);
  await cards.create(aCard('c', 'd2'), ['recognition', 'production'], NOW);
});

describe('items.pool', () => {
  it('holds every visible item of one direction, new ones included', async () => {
    const pool = await items.pool('recognition');
    expect(pool.map((i) => i.cardId).sort()).toEqual(['a', 'b', 'c']);
    expect(pool.every((i) => i.dir === 'recognition')).toBe(true);
  });

  it('leaves out suspended items and deleted cards', async () => {
    await items.setSuspended(['a:recognition'], true, NOW);
    await db.cards.update('b', { deletedAt: NOW });
    expect((await items.pool('recognition')).map((i) => i.cardId)).toEqual(['c']);
  });

  it('narrows to the given decks', async () => {
    expect((await items.pool('recognition', new Set(['d2']))).map((i) => i.cardId)).toEqual(['c']);
  });
});

describe('usePracticeSession', () => {
  it('draws from the studied decks only', async () => {
    await saveStudyDeckIds(['d2']);
    const session = usePracticeSession('review');
    await session.start();
    expect(session.total.value).toBe(1);
    expect(session.current.value?.cardId).toBe('c');
    expect(session.card.value?.id).toBe('c');
  });

  it('never ends, and counts what was seen and got right', async () => {
    const session = usePracticeSession('writing');
    await session.start();
    expect(session.current.value?.dir).toBe('production');
    for (let n = 0; n < 10; n++) {
      session.reveal();
      await session.grade(n % 2 === 0 ? 3 : 1);
      expect(session.ended.value).toBe(false);
      expect(session.revealed.value).toBe(false);
      expect(session.current.value).not.toBeNull();
      expect(session.card.value?.id).toBe(session.current.value?.cardId);
    }
    expect(session.seen.value).toBe(10);
    expect(session.right.value).toBe(5);
  });

  it('does not show the card just answered again when others are left', async () => {
    const session = usePracticeSession('review');
    await session.start();
    for (let n = 0; n < 20; n++) {
      const before = session.current.value!.id;
      await session.grade(1);
      expect(session.current.value!.id).not.toBe(before);
    }
  });

  it('writes nothing: no review log, no change to any item', async () => {
    const before = await db.items.toArray();
    const session = usePracticeSession('review');
    await session.start();
    for (let n = 0; n < 5; n++) await session.grade(n % 2 === 0 ? 1 : 4);
    expect(await db.reviews.count()).toBe(0);
    expect(await db.items.toArray()).toEqual(before);
  });

  it('is empty, not ended, when there is nothing to practise', async () => {
    await db.items.clear();
    const session = usePracticeSession('review');
    await session.start();
    expect(session.total.value).toBe(0);
    expect(session.current.value).toBeNull();
  });
});
