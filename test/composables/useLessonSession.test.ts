import 'fake-indexeddb/auto';
import { beforeEach, describe, expect, it } from 'vitest';
import { useLessonSession } from '~/composables/useLessonSession';
import { db } from '~core/db/db';
import { cards, decks } from '~core/db/repositories';

const NOW = Date.parse('2026-10-27T08:00:00Z');

const aDeck = (id: string, tag: string) => ({
  id, name: id, description: '', colorToken: 'var(--chart-series-1)',
  tag, translationLang: 'en', createdAt: NOW, updatedAt: NOW, deletedAt: null,
});

const aCard = (id: string, deckId: string) => ({
  id, deckId, hanzi: '學習', pinyin: [{ text: 'xué', tone: 2 as const }],
  zhuyin: '', translation: 'to study', pos: 'verb' as const, example: '', examplePinyin: '',
  exampleTranslation: '', tags: [], note: '', createdAt: NOW, updatedAt: NOW, deletedAt: null,
});

beforeEach(async () => {
  await db.delete();
  await db.open();
  await decks.put(aDeck('l5a', 'Lesson 5'));
  await decks.put(aDeck('l5b', 'Lesson 5'));
  await decks.put(aDeck('l6', 'Lesson 6'));
  await cards.create(aCard('a', 'l5a'), ['recognition', 'production'], NOW);
  await cards.create(aCard('b', 'l5b'), ['recognition'], NOW);
  await cards.create(aCard('c', 'l6'), ['recognition', 'production'], NOW);
});

describe('useLessonSession', () => {
  it("draws every card of the lesson's decks, in the mode direction", async () => {
    const review = useLessonSession('review', 'Lesson 5');
    await review.start();
    expect(review.total.value).toBe(2);
    const writing = useLessonSession('writing', 'Lesson 5');
    await writing.start();
    expect(writing.total.value).toBe(1);
  });

  it('is empty for a lesson no deck carries', async () => {
    const s = useLessonSession('review', 'Lesson 9');
    await s.start();
    expect(s.total.value).toBe(0);
    expect(s.current.value).toBeNull();
  });

  it('ends once every card is answered right, a miss coming back', async () => {
    const s = useLessonSession('review', 'Lesson 5');
    await s.start();
    const first = s.current.value!.id;
    await s.grade(1);
    expect(s.ended.value).toBe(false);
    expect(s.learned.value).toBe(0);
    await s.grade(3);
    expect(s.learned.value).toBe(1);
    expect(s.current.value!.id).toBe(first);
    await s.grade(3);
    expect(s.ended.value).toBe(true);
    expect(s.seen.value).toBe(3);
    expect(s.right.value).toBe(2);
    expect(s.firstTry.value).toBe(1);
  });

  it('starts the schedule of a new card and logs no attempt for that answer', async () => {
    const s = useLessonSession('review', 'Lesson 5');
    await s.start();
    await s.grade(3);
    expect(await db.reviews.count()).toBe(1);
    expect((await db.reviews.toArray())[0]!.before.state).toBe('new');
  });
});
