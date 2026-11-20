import 'fake-indexeddb/auto';
import { beforeEach, describe, expect, it } from 'vitest';
import { useStats } from '~/composables/useStats';
import { db } from '~core/db/db';
import { cards, decks } from '~core/db/repositories';

const NOW = Date.parse('2026-09-16T08:00:00Z');
const aDeck = (id: string, deletedAt: number | null = null) => ({ id, name: id, description: '', colorToken: 'var(--chart-series-1)', tag: '', bundle: 'taiwan' as const, translationLang: 'en', createdAt: NOW, updatedAt: NOW, deletedAt });

beforeEach(async () => {
  await db.delete();
  await db.open();
  await decks.put(aDeck('d1'));
  await decks.put(aDeck('d2', NOW));
  await cards.create({ id: 'c1', deckId: 'd1', hanzi: '學', pinyin: [], zhuyin: '', translation: 'study', pos: 'verb', example: '', examplePinyin: '', exampleTranslation: '', tags: [], note: '', createdAt: NOW, updatedAt: NOW, deletedAt: null }, ['recognition', 'production'], NOW);
});

describe('useStats', () => {
  it('loads a snapshot and filters it', async () => {
    const s = useStats();
    await s.load();
    expect(s.filtered.value?.items).toHaveLength(2);
    s.filter.mode = 'writing';
    expect(s.filtered.value?.items.map((i) => i.dir)).toEqual(['production']);
  });

  it('offers live decks only', async () => {
    const s = useStats();
    await s.load();
    expect(s.deckOptions.value).toEqual([{ id: 'd1', label: 'd1' }]);
  });

  it("offers each lesson, narrows the decks to it, and drops a deck outside it", async () => {
    await decks.put({ ...aDeck('L1 - 1'), tag: 'Lesson 1' });
    await decks.put({ ...aDeck('L2 - 1'), tag: 'Lesson 2' });
    const s = useStats();
    await s.load();
    expect(s.lessonOptions.value.map((o) => o.id)).toEqual(['Lesson 1', 'Lesson 2']);
    s.selectDeck('L1 - 1');
    s.selectLesson('Lesson 2');
    expect(s.deckOptions.value.map((o) => o.id)).toEqual(['L2 - 1']);
    expect(s.filter.deckId).toBeNull();
  });

  it('clears the lesson when a deck outside it is picked', async () => {
    await decks.put({ ...aDeck('L2 - 1'), tag: 'Lesson 2' });
    const s = useStats();
    await s.load();
    s.selectLesson('Lesson 2');
    s.selectDeck('d1');
    expect(s.filter).toMatchObject({ lesson: null, deckId: 'd1' });
  });
});
