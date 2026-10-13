import 'fake-indexeddb/auto';
import { beforeEach, describe, expect, it } from 'vitest';
import { useWritingRetry } from '~/composables/useWritingRetry';
import { db } from '~core/db/db';
import { cards, decks } from '~core/db/repositories';
import type { WritingResult } from '~core/db/schema';

const NOW = Date.parse('2026-10-13T08:00:00Z');
const result = (shapeCorrect: boolean): WritingResult => ({
  character: '學', shapeCorrect, orderCorrect: shapeCorrect, error: shapeCorrect ? null : 'stroke-shape', strokeIndex: null, expected: 16, drawn: 16,
});

beforeEach(async () => {
  await db.delete();
  await db.open();
  await decks.put({ id: 'd1', name: 'd1', description: '', colorToken: 'var(--chart-series-1)', tag: '', translationLang: 'en', createdAt: NOW, updatedAt: NOW, deletedAt: null });
  await cards.create(
    { id: 'c1', deckId: 'd1', hanzi: '學', pinyin: [{ text: 'xué', tone: 2 }], zhuyin: '', translation: 'to study', pos: 'verb', example: '', examplePinyin: '', exampleTranslation: '', tags: [], note: '', createdAt: NOW, updatedAt: NOW, deletedAt: null },
    ['production'],
    NOW,
  );
});

describe('useWritingRetry', () => {
  it('keeps the first verdict, whatever the retries draw', () => {
    const retry = useWritingRetry();
    retry.keepFirst(false, 3, [result(false)]);
    retry.keepFirst(true, 3, [result(true)]);
    expect(retry.first.value).toEqual({ correct: false, grade: 1, rightGrade: 3, results: [result(false)] });
  });

  it('hands back plain results that IndexedDB can store', () => {
    const retry = useWritingRetry();
    retry.keepFirst(false, 3, [result(false)]);
    expect(() => structuredClone([...retry.first.value!.results])).not.toThrow();
  });

  it('grades a right first try with its right grade', () => {
    const retry = useWritingRetry();
    retry.keepFirst(true, 2, [result(true)]);
    expect(retry.first.value?.grade).toBe(2);
  });

  it('logs each retry as a practice attempt and never schedules it', async () => {
    const retry = useWritingRetry();
    const item = (await db.items.get('c1:production'))!;
    retry.keepFirst(false, 3, [result(false)]);
    retry.start();
    expect(retry.retrying.value).toBe(true);

    await retry.logRetry(item, [result(true)]);

    expect(retry.retrying.value).toBe(false);
    expect(retry.retries.value).toBe(1);
    const logged = await db.attempts.toArray();
    expect(logged).toHaveLength(1);
    expect(logged[0]).toMatchObject({ source: 'practice', mode: 'writing', correct: true, grade: 3, checked: true });
    expect(await db.reviews.count()).toBe(0);
    expect(await db.items.get('c1:production')).toEqual(item);
  });

  it('forgets everything for the next card', () => {
    const retry = useWritingRetry();
    retry.keepFirst(true, 3, [result(true)]);
    retry.start();
    retry.clear();
    expect(retry.first.value).toBeNull();
    expect(retry.retrying.value).toBe(false);
    expect(retry.retries.value).toBe(0);
  });
});
