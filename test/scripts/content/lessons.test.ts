import { describe, expect, it } from 'vitest';
import { cutLessons } from '../../../scripts/content/lib/lessons.mjs';

const words = (n: number) => Array.from({ length: n }, (_, i) => ({ id: `hsk1-${String(i + 1).padStart(4, '0')}` }));

describe('cutLessons', () => {
  it('merges a short last lesson into the previous one', () => {
    const { lessons, units } = cutLessons(words(23), 1, 'hsk');
    expect(lessons.map((l) => l.wordIds.length)).toEqual([10, 13]);
    expect(lessons.map((l) => l.id)).toEqual(['hsk1-l001', 'hsk1-l002']);
    expect(units).toEqual([{ id: 'hsk1-u01', lessonIds: ['hsk1-l001', 'hsk1-l002'] }]);
    expect(lessons.every((l) => l.unit === 'hsk1-u01')).toBe(true);
  });

  it('makes units of three lessons', () => {
    const { lessons, units } = cutLessons(words(64), 1, 'hsk');
    expect(lessons.map((l) => l.wordIds.length)).toEqual([10, 10, 10, 10, 10, 14]);
    expect(units.map((u) => u.lessonIds.length)).toEqual([3, 3]);
    expect(lessons[3]?.unit).toBe('hsk1-u02');
  });

  it('keeps a last lesson of five or more, and a short last unit alone', () => {
    const { lessons, units } = cutLessons(words(75), 7, 'tbcl');
    expect(lessons.map((l) => l.wordIds.length)).toEqual([10, 10, 10, 10, 10, 10, 10, 5]);
    expect(units.map((u) => u.id)).toEqual(['tbcl7-u01', 'tbcl7-u02', 'tbcl7-u03']);
    expect(units[2]?.lessonIds).toEqual(['tbcl7-l007', 'tbcl7-l008']);
  });

  it('keeps a lone short level as one lesson', () => {
    expect(cutLessons(words(3), 1, 'hsk').lessons).toHaveLength(1);
  });
});
