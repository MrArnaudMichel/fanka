import 'fake-indexeddb/auto';
import { beforeEach, describe, expect, it } from 'vitest';
import { useTranslationDrill } from '~/composables/useTranslationDrill';
import { db } from '~core/db/db';
import { cards, decks } from '~core/db/repositories';
import { saveStudyDeckIds } from '~core/db/study-decks';

const NOW = Date.parse('2026-10-27T08:00:00Z');

const aDeck = (id: string, tag: string) => ({
  id, name: id, description: '', colorToken: 'var(--chart-series-1)',
  tag, translationLang: 'en', createdAt: NOW, updatedAt: NOW, deletedAt: null,
});

const aCard = (id: string, deckId: string, hanzi: string, translation: string) => ({
  id, deckId, hanzi, pinyin: [{ text: 'māo', tone: 1 as const }],
  zhuyin: '', translation, pos: 'noun' as const, example: '', examplePinyin: '',
  exampleTranslation: '', tags: [], note: '', createdAt: NOW, updatedAt: NOW, deletedAt: null,
});

beforeEach(async () => {
  await db.delete();
  await db.open();
  await decks.put(aDeck('l5', 'Lesson 5'));
  await decks.put(aDeck('l6', 'Lesson 6'));
  await cards.create(aCard('a', 'l5', '貓', 'cat'), ['recognition'], NOW);
  await cards.create(aCard('b', 'l5', '狗', 'dog'), ['recognition'], NOW);
  await cards.create(aCard('c', 'l6', '球', 'ball'), ['recognition'], NOW);
});

describe('useTranslationDrill', () => {
  it('lists the lessons', async () => {
    const d = useTranslationDrill();
    await d.loadLessons();
    expect(d.lessons.value).toEqual(['Lesson 5', 'Lesson 6']);
  });

  it("loads one lesson's words, or the studied decks'", async () => {
    const d = useTranslationDrill();
    await d.load('Lesson 5');
    expect(d.words.value.map((w) => w.hanzi).sort()).toEqual(['狗', '貓']);
    await saveStudyDeckIds(['l6']);
    await d.load(null);
    expect(d.words.value.map((w) => w.translation)).toEqual(['ball']);
  });

  it('logs an answer as checked practice without touching the schedule', async () => {
    const d = useTranslationDrill();
    await d.load('Lesson 5');
    await d.answer('a', true, 1200);
    const [attempt] = await db.attempts.toArray();
    expect(attempt).toMatchObject({ cardId: 'a', source: 'practice', grade: 3, checked: true, mode: 'review' });
    expect((await db.items.get('a:recognition'))!.state).toBe('new');
    expect(await db.reviews.count()).toBe(0);
  });
});
