import { describe, expect, it } from 'vitest';
import { nextStep, scoreLesson, writingId } from '../../core/curriculum/engine';
import type { ContentIndex } from '../../core/curriculum/types';

const lessons = (ids: string[], unit: string) => ids.map((id) => ({ id, unit, wordIds: [] }));

const index: ContentIndex = {
  bundle: 'taiwan',
  version: '1',
  levels: [
    {
      level: 1,
      name: 'HSK 1',
      file: 'level-1.json',
      wordCount: 0,
      units: [
        { id: 'hsk1-u01', lessonIds: ['hsk1-l001', 'hsk1-l002', 'hsk1-l003'] },
        { id: 'hsk1-u02', lessonIds: ['hsk1-l004'] },
      ],
      lessons: [
        ...lessons(['hsk1-l001', 'hsk1-l002', 'hsk1-l003'], 'hsk1-u01'),
        ...lessons(['hsk1-l004'], 'hsk1-u02'),
      ],
    },
  ],
};

describe('nextStep', () => {
  it('starts at the first lesson', () => {
    const step = nextStep(index, new Set());
    expect(step?.kind === 'lesson' && step.lesson.id).toBe('hsk1-l001');
  });

  it('offers the unit writing once its lessons are done', () => {
    const step = nextStep(index, new Set(['hsk1-l001', 'hsk1-l002', 'hsk1-l003']));
    expect(step?.kind === 'writing' && step.unit.id).toBe('hsk1-u01');
  });

  it('moves on after the writing', () => {
    const done = new Set(['hsk1-l001', 'hsk1-l002', 'hsk1-l003', writingId('hsk1-u01')]);
    const step = nextStep(index, done);
    expect(step?.kind === 'lesson' && step.lesson.id).toBe('hsk1-l004');
  });

  it('returns null when everything is done', () => {
    const done = new Set([
      'hsk1-l001', 'hsk1-l002', 'hsk1-l003', 'hsk1-l004',
      writingId('hsk1-u01'), writingId('hsk1-u02'),
    ]);
    expect(nextStep(index, done)).toBeNull();
  });

  it('names a writing session after its unit', () => {
    expect(writingId('hsk1-u01')).toBe('hsk1-u01-writing');
  });
});

describe('scoreLesson', () => {
  it('counts right answers and lists each missed word once', () => {
    expect(
      scoreLesson([
        { wordId: 'a', right: true },
        { wordId: 'b', right: false },
        { wordId: 'b', right: false },
        { wordId: 'c', right: true },
      ]),
    ).toEqual({ right: 2, total: 4, missed: ['b'] });
  });
});
