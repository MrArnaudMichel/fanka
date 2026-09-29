import 'fake-indexeddb/auto';
import { beforeEach, describe, expect, it } from 'vitest';
import { useStats } from '~/composables/useStats';
import { db } from '~core/db/db';
import { cards, decks } from '~core/db/repositories';

const NOW = Date.parse('2026-09-16T08:00:00Z');
const aDeck = (id: string, deletedAt: number | null = null) => ({ id, name: id, description: '', colorToken: 'var(--chart-series-1)', tag: '', translationLang: 'en', createdAt: NOW, updatedAt: NOW, deletedAt });

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
    expect(s.deckOptions.value).toEqual([{ value: 'd1', label: 'd1' }]);
  });
});
