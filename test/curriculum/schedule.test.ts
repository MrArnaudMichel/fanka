import { describe, expect, it } from 'vitest';
import { seedState, writingCharacters } from '../../core/curriculum/schedule';
import { schedulerFor } from '../../core/srs';
import type { Word } from '../../core/curriculum/types';

const scheduler = schedulerFor('FSRS');
const settings = { desiredRetention: 0.9, maxInterval: 36500 };
const DAY = 86_400_000;

describe('seedState', () => {
  it('keeps a right word away until the next 04:00', () => {
    for (const hour of [1, 3, 4, 10, 23]) {
      const now = new Date(2026, 10, 21, hour, 30).getTime();
      const next = new Date(now);
      next.setHours(4, 0, 0, 0);
      if (next.getTime() <= now) next.setDate(next.getDate() + 1);
      const state = seedState(scheduler, settings, true, now);
      expect(state.due).toBeGreaterThanOrEqual(next.getTime());
      expect(state.state).not.toBe('new');
    }
  });

  it('brings a wrong word back within a day', () => {
    const now = new Date(2026, 10, 21, 10).getTime();
    const state = seedState(scheduler, settings, false, now);
    expect(state.due).toBeLessThanOrEqual(now + DAY);
    expect(state.state).not.toBe('new');
  });
});

describe('writingCharacters', () => {
  const word = (id: string, hanzi: string) => ({ id, hanzi }) as Word;

  it('keeps Han characters with strokes, in word order, and drops empty words', () => {
    const words = [word('a', '你好'), word('b', 'ABC'), word('c', '他們們'), word('d', '龘')];
    const result = writingCharacters(words, (ch) => ch !== '龘');
    expect(result).toEqual([
      { wordId: 'a', chars: ['你', '好'] },
      { wordId: 'c', chars: ['他', '們'] },
    ]);
  });
});
