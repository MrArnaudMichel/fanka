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
