import 'fake-indexeddb/auto';
import { beforeEach, describe, expect, it } from 'vitest';
import { completeLesson, completeWriting } from '~core/db/curriculum';
import { db } from '~core/db/db';
import { itemId } from '~core/db/schema';
import type { Scheduler, SchedulerSettings } from '~core/srs/types';
import type { LessonRef, LevelRef, UnitRef, Word } from '~core/curriculum/types';

const NOW = new Date(2026, 0, 10, 15, 0).getTime();
const settings: SchedulerSettings = { desiredRetention: 0.9, maxInterval: 365 };
const scheduler: Scheduler = {
  preview: () => {
    throw new Error('unused');
  },
  apply: (state, grade, now) => ({ ...state, state: grade > 1 ? 'review' : 'learning', due: now + 60_000, stability: grade }),
};

const word = (n: number, hanzi: string, over: Partial<Word> = {}): Word => ({
  id: `hsk1-000${n}`,
  hanzi,
  readings: [{ pinyin: 'xue2 xi2', meanings: ['to study', 'to learn'] }],
  pos: 'verb',
  level: 1,
  lesson: 'hsk1-u01-l1',
  ...over,
});
const words = [
  word(1, '學習', { example: { text: '我學習中文。', pinyin: 'wo3 xue2 xi2 zhong1 wen2', translation: 'I study Chinese.', segments: [] }, readings: [{ pinyin: 'xue2 xi2', meanings: ['to study'] }, { pinyin: 'xi2 xue2', meanings: ['other'] }] }),
  word(2, '朋友', { readings: [{ pinyin: 'peng2 you5', zhuyin: 'ㄆㄥˊ ˙ㄧㄡ', meanings: ['friend'] }] }),
];
const level: LevelRef = { level: 1, name: 'HSK 1', file: 'level-1.json', units: [], lessons: [], wordCount: 2 };
const lesson: LessonRef = { id: 'hsk1-u01-l1', unit: 'hsk1-u01', wordIds: words.map((w) => w.id) };
const unit: UnitRef = { id: 'hsk1-u01', lessonIds: [lesson.id] };
const r = (wordId: string, right: boolean, exercise: 'reading' | 'writing' = 'reading') => ({ wordId, exercise, right, at: NOW, durationMs: 500 });

const base = { bundle: 'mainland' as const, level, lesson, words, durationMs: 1000, now: NOW, scheduler, settings };

beforeEach(async () => {
  await db.delete();
  await db.open();
});

describe('completeLesson', () => {
  it('writes deck, cards, seeded items, attempts and progress, all queued for sync', async () => {
    await completeLesson({ ...base, results: [r('hsk1-0001', true), r('hsk1-0001', true, 'writing'), r('hsk1-0002', true), r('hsk1-0002', false)] });
    const deck = await db.decks.get('curriculum:hsk1');
    expect(deck).toMatchObject({ name: 'HSK 1', tag: 'HSK', bundle: 'mainland', colorToken: 'var(--chart-series-1)' });
    const card = await db.cards.get('hsk1-0001');
    expect(card).toMatchObject({ deckId: 'curriculum:hsk1', hanzi: '學習', translation: 'to study', pos: 'verb', example: '我學習中文。', tags: ['HSK 1'], note: 'xi2 xue2: other' });
    expect(card!.pinyin.map((s) => s.text).join('')).toBe('xuéxí');
    expect(card!.zhuyin).toBe('ㄒㄩㄝˊ ㄒㄧˊ');
    expect((await db.cards.get('hsk1-0002'))!.zhuyin).toBe('ㄆㄥˊ ˙ㄧㄡ');
    const good = await db.items.get(itemId('hsk1-0001', 'recognition'));
    const bad = await db.items.get(itemId('hsk1-0002', 'recognition'));
    expect(good).toMatchObject({ state: 'review', stability: 3 });
    expect(good!.due).toBe(new Date(2026, 0, 11, 4, 0).getTime());
    expect(bad).toMatchObject({ state: 'learning', stability: 1 });
    expect(await db.items.count()).toBe(2);
    const attempts = await db.attempts.toArray();
    expect(attempts).toHaveLength(4);
    expect(attempts.every((a) => a.source === 'lesson')).toBe(true);
    expect(attempts.map((a) => `${a.mode}:${a.grade}`).sort()).toEqual(['review:1', 'review:3', 'review:3', 'writing:3']);
    expect(await db.lessonProgress.get(lesson.id)).toMatchObject({ kind: 'lesson', right: 3, total: 4, known: false });
    const outbox = (await db.outbox.toArray()).map((o) => o.entity);
    for (const entity of ['deck', 'card', 'item', 'attempt', 'lessonProgress']) expect(outbox).toContain(entity);
    expect(outbox.filter((e) => e === 'attempt')).toHaveLength(4);
  });

  it('creates nothing new and keeps existing items when done again', async () => {
    await completeLesson({ ...base, results: [r('hsk1-0001', false), r('hsk1-0002', true)] });
    const before = await db.items.get(itemId('hsk1-0001', 'recognition'));
    await completeLesson({ ...base, now: NOW + 1000, results: [r('hsk1-0001', true), r('hsk1-0002', true)] });
    expect(await db.cards.count()).toBe(2);
    expect(await db.items.count()).toBe(2);
    expect(await db.decks.count()).toBe(1);
    expect(await db.items.get(itemId('hsk1-0001', 'recognition'))).toEqual(before);
    expect(await db.attempts.count()).toBe(4);
    expect(await db.lessonProgress.count()).toBe(1);
  });

  it('creates the curriculum card although the hanzi already exists in a user deck', async () => {
    await db.cards.put({ ...(await mine()), id: 'mine-1', deckId: 'user-deck', hanzi: '學習' });
    await completeLesson({ ...base, results: [r('hsk1-0001', true), r('hsk1-0002', true)] });
    expect((await db.cards.get('hsk1-0001'))!.deckId).toBe('curriculum:hsk1');
    expect(await db.cards.count()).toBe(3);
  });
});

async function mine() {
  await completeLesson({ ...base, words: [words[0]!], results: [r('hsk1-0001', true)] });
  const card = (await db.cards.get('hsk1-0001'))!;
  await db.delete();
  await db.open();
  return card;
}

describe('completeWriting', () => {
  const writing = { bundle: 'mainland' as const, level, unit, words, now: NOW, scheduler, settings };
  const wr = (wordId: string, right: boolean) => ({ wordId, right, at: NOW, durationMs: 800 });

  it('adds production items only for carded words with stroke data', async () => {
    await completeLesson({ ...base, results: [r('hsk1-0001', true), r('hsk1-0002', true)] });
    await completeWriting({ ...writing, results: [wr('hsk1-0001', true), wr('hsk1-0002', true)], hasStrokes: (ch) => '學習'.includes(ch) });
    expect(await db.items.get(itemId('hsk1-0001', 'production'))).toMatchObject({ state: 'review' });
    expect(await db.items.get(itemId('hsk1-0002', 'production'))).toBeUndefined();
    const attempts = (await db.attempts.toArray()).filter((a) => a.mode === 'writing');
    expect(attempts).toHaveLength(1);
    expect(attempts[0]).toMatchObject({ source: 'lesson', itemId: itemId('hsk1-0001', 'production'), deckId: 'curriculum:hsk1' });
    expect(await db.lessonProgress.get('hsk1-u01-writing')).toMatchObject({ kind: 'writing', known: false });
  });

  it('skips a word with no card', async () => {
    await completeWriting({ ...writing, results: [wr('hsk1-0001', true)], hasStrokes: () => true });
    expect(await db.items.count()).toBe(0);
    expect(await db.lessonProgress.get('hsk1-u01-writing')).toBeDefined();
  });
});

