import 'fake-indexeddb/auto';
import { beforeEach, describe, expect, it } from 'vitest';
import { dueToday } from '~/composables/useDueCounts';
import { useStudyDecks } from '~/composables/useStudyDecks';
import { db } from '~core/db/db';
import { cards, decks } from '~core/db/repositories';
import { saveSettings } from '~core/db/settings';
import { loadStudyDeckIds, saveStudyDeckIds, studyDeckFilter } from '~core/db/study-decks';

const NOW = Date.parse('2026-09-16T08:00:00Z');

const aDeck = (id: string, over = {}) => ({
  id, name: id, description: '', colorToken: 'var(--chart-series-1)',
  tag: '', translationLang: 'en', createdAt: NOW, updatedAt: NOW, deletedAt: null, ...over,
});

const aCard = (id: string, deckId: string, createdAt = NOW) => ({
  id, deckId, hanzi: '學習', pinyin: [{ text: 'xué', tone: 2 as const }],
  zhuyin: '', translation: 'to study', pos: 'verb' as const, example: '', examplePinyin: '',
  exampleTranslation: '', tags: [], note: '', createdAt, updatedAt: NOW, deletedAt: null,
});

/** Two decks, three new recognition cards each; d1's cards are the oldest. */
async function twoDecks(): Promise<void> {
  await decks.put(aDeck('d1'));
  await decks.put(aDeck('d2'));
  for (let n = 0; n < 3; n++) {
    await cards.create(aCard(`a${n}`, 'd1', NOW - 100 + n), ['recognition'], NOW);
    await cards.create(aCard(`b${n}`, 'd2', NOW + n), ['recognition'], NOW);
  }
}

const cardIds = (list: { cardId: string }[]) => list.map((i) => i.cardId).sort();

beforeEach(async () => {
  await db.delete();
  await db.open();
});

describe('study deck ids', () => {
  it('is empty when nothing is stored', async () => {
    expect(await loadStudyDeckIds()).toEqual([]);
  });

  it('persists and reads back', async () => {
    await saveStudyDeckIds(['d1', 'd2']);
    expect(await loadStudyDeckIds()).toEqual(['d1', 'd2']);
  });
});

describe('studyDeckFilter', () => {
  it('is undefined with no selection, meaning every deck', async () => {
    await decks.put(aDeck('d1'));
    expect(await studyDeckFilter()).toBeUndefined();
  });

  it('keeps only live decks from the selection', async () => {
    await decks.put(aDeck('d1'));
    await decks.put(aDeck('d2', { deletedAt: NOW }));
    await saveStudyDeckIds(['d1', 'd2', 'gone']);
    expect([...(await studyDeckFilter())!]).toEqual(['d1']);
  });

  it('falls back to every deck when no selected deck is left', async () => {
    await decks.put(aDeck('d1', { deletedAt: NOW }));
    await saveStudyDeckIds(['d1']);
    expect(await studyDeckFilter()).toBeUndefined();
  });
});

describe('dueToday with a study selection', () => {
  it('offers every deck when nothing is selected', async () => {
    await twoDecks();
    const { fresh } = await dueToday(NOW, 'recognition');
    expect(cardIds(fresh)).toEqual(['a0', 'a1', 'a2', 'b0', 'b1', 'b2']);
  });

  it('offers only the selected decks', async () => {
    await twoDecks();
    await saveStudyDeckIds(['d2']);
    const { fresh } = await dueToday(NOW, 'recognition');
    expect(cardIds(fresh)).toEqual(['b0', 'b1', 'b2']);
  });

  it('fills the daily allowance from the selected decks, not before filtering', async () => {
    await twoDecks();
    await saveSettings({ newPerDay: 2 });
    await saveStudyDeckIds(['d2']);
    const { fresh } = await dueToday(NOW, 'recognition');
    expect(cardIds(fresh)).toEqual(['b0', 'b1']);
  });

  it('limits due cards to the selected decks', async () => {
    await twoDecks();
    for (const id of ['a0:recognition', 'b0:recognition']) {
      const item = (await db.items.get(id))!;
      await db.items.put({ ...item, state: 'review', due: NOW - 1, reps: 1 });
    }
    await saveStudyDeckIds(['d1']);
    const { due } = await dueToday(NOW, 'recognition');
    expect(cardIds(due)).toEqual(['a0']);
  });
});

describe('useStudyDecks', () => {
  it('toggles a deck in and out of the selection and persists it', async () => {
    const study = useStudyDecks();
    await study.load();
    await study.toggle('d1', true);
    await study.toggle('d2', true);
    expect(study.ids.value).toEqual(['d1', 'd2']);
    await study.toggle('d1', false);
    expect(study.ids.value).toEqual(['d2']);
    expect(await loadStudyDeckIds()).toEqual(['d2']);
  });

  it('clears the selection', async () => {
    const study = useStudyDecks();
    await study.toggle('d1', true);
    await study.clear();
    expect(study.ids.value).toEqual([]);
    expect(await loadStudyDeckIds()).toEqual([]);
  });
});
