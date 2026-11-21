import 'fake-indexeddb/auto';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { db } from '~core/db/db';
import type { ContentIndex, Word } from '~core/curriculum/types';

const words: Word[] = [1, 2].map((n) => ({
  id: `hsk1-000${n}`,
  hanzi: n === 1 ? '學習' : '朋友',
  readings: [{ pinyin: 'xue2 xi2', meanings: ['to study'] }],
  level: 1,
  lesson: 'hsk1-u01-l1',
}));
const index: ContentIndex = {
  bundle: 'mainland',
  version: 'v1',
  levels: [
    {
      level: 1,
      name: 'HSK 1',
      file: 'level-1.json',
      units: [{ id: 'hsk1-u01', lessonIds: ['hsk1-u01-l1'] }],
      lessons: [{ id: 'hsk1-u01-l1', unit: 'hsk1-u01', wordIds: words.map((w) => w.id) }],
      wordCount: 2,
    },
  ],
};

beforeEach(async () => {
  vi.resetModules();
  await db.delete();
  await db.open();
  vi.stubGlobal(
    'fetch',
    vi.fn(async (url: string) => {
      if (url.startsWith('/strokes/')) return { ok: false, status: 404, json: async () => ({}) };
      return { ok: true, status: 200, json: async () => (url.endsWith('index.json') ? index : words) };
    }),
  );
});

describe('useLesson', () => {
  it('writes each attempt once when finish is called twice at once', async () => {
    const { useLesson } = await import('../../app/composables/useLesson');
    const lesson = useLesson('hsk1-u01-l1');
    await lesson.start();
    const count = lesson.exercises.value.length;
    expect(count).toBeGreaterThan(0);
    for (let i = 0; i < count; i += 1) lesson.answer(true);
    await Promise.all([lesson.finish(), lesson.finish()]);
    expect(await db.attempts.count()).toBe(count);
    expect(await db.lessonProgress.count()).toBe(1);
  });
});

describe('useLesson after a failed write', () => {
  it('lets finish be tried again', async () => {
    const actual = await vi.importActual<typeof import('~core/db/curriculum')>('~core/db/curriculum');
    const completeLesson = vi
      .fn<typeof actual.completeLesson>()
      .mockRejectedValueOnce(new Error('disk full'))
      .mockImplementation(actual.completeLesson);
    vi.doMock('~core/db/curriculum', () => ({ ...actual, completeLesson }));
    const { useLesson } = await import('../../app/composables/useLesson');
    const lesson = useLesson('hsk1-u01-l1');
    await lesson.start();
    for (let i = 0; i < lesson.exercises.value.length; i += 1) lesson.answer(true);
    await expect(lesson.finish()).rejects.toThrow('disk full');
    expect(lesson.finished.value).toBe(false);
    await lesson.finish();
    expect(lesson.finished.value).toBe(true);
    expect(await db.lessonProgress.count()).toBe(1);
    vi.doUnmock('~core/db/curriculum');
  });
});

describe('useLesson writing session', () => {
  const strokeFetch = () =>
    vi.fn(async (url: string) => {
      if (url.startsWith('/strokes/')) return { ok: true, status: 200, json: async () => ({ strokes: ['M0 0'], medians: [[[0, 0]]] }) };
      return { ok: true, status: 200, json: async () => (url.endsWith('index.json') ? index : words) };
    });

  it('has nothing to write while no word of the unit has a card, and writes nothing', async () => {
    vi.stubGlobal('fetch', strokeFetch());
    const { useLesson } = await import('../../app/composables/useLesson');
    const lesson = useLesson('hsk1-u01-writing');
    await lesson.start();
    expect(lesson.exercises.value).toHaveLength(0);
    expect(lesson.nothingToWrite.value).toBe('cards');
    await lesson.finish();
    expect(await db.lessonProgress.count()).toBe(0);
  });

  it('builds the session from the words that have a card only', async () => {
    vi.stubGlobal('fetch', strokeFetch());
    const { completeLesson } = await import('~core/db/curriculum');
    const { schedulerFor } = await import('~core/srs');
    await completeLesson({
      bundle: 'mainland', level: index.levels[0]!, lesson: index.levels[0]!.lessons[0]!, words: [words[0]!],
      results: [], durationMs: 1, now: Date.now(), scheduler: schedulerFor('FSRS'), settings: { desiredRetention: 0.9, maxInterval: 365 },
    });
    const { useLesson } = await import('../../app/composables/useLesson');
    const lesson = useLesson('hsk1-u01-writing');
    await lesson.start();
    expect(lesson.nothingToWrite.value).toBeNull();
    expect(lesson.exercises.value.map((e) => e.wordId)).toEqual(['hsk1-0001']);
  });
});
