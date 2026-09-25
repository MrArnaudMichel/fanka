import { describe, expect, it } from 'vitest';
import { MAX_WEIGHT, RECENT_WINDOW, pickNext, weightAfter } from '~core/srs/practice';

/** A deterministic `random` that returns each value in turn. */
function sequence(...values: number[]): () => number {
  let i = 0;
  return () => values[i++ % values.length]!;
}

describe('weightAfter', () => {
  it('triples a missed card, up to a cap', () => {
    expect(weightAfter(1, false)).toBe(3);
    expect(weightAfter(3, false)).toBe(MAX_WEIGHT);
    expect(weightAfter(MAX_WEIGHT, false)).toBe(MAX_WEIGHT);
  });

  it('brings a known card back down, never below 1', () => {
    expect(weightAfter(9, true)).toBe(3);
    expect(weightAfter(3, true)).toBe(1);
    expect(weightAfter(1, true)).toBe(1);
  });
});

describe('pickNext', () => {
  it('returns null for an empty pool', () => {
    expect(pickNext([], new Map(), [])).toBeNull();
  });

  it('returns the only card, even if it was just shown', () => {
    expect(pickNext(['a'], new Map(), ['a'])).toBe('a');
  });

  it(`never repeats any of the last ${RECENT_WINDOW} cards when the pool allows it`, () => {
    const ids = ['a', 'b', 'c', 'd', 'e'];
    for (let r = 0; r < 1; r += 0.05) {
      const picked = pickNext(ids, new Map(), ['a', 'b', 'c'], () => r);
      expect(['d', 'e']).toContain(picked);
    }
  });

  it('shrinks the no-repeat window for a small pool so something is always left', () => {
    // Two cards: only the one just shown is excluded.
    expect(pickNext(['a', 'b'], new Map(), ['x', 'b', 'a'], () => 0)).toBe('b');
  });

  it('picks in proportion to weight', () => {
    const weights = new Map([['b', 3]]);
    // Total weight 1 + 3 = 4: [0, 0.25) is a, [0.25, 1) is b.
    expect(pickNext(['a', 'b'], weights, [], sequence(0.2))).toBe('a');
    expect(pickNext(['a', 'b'], weights, [], sequence(0.3))).toBe('b');
  });
});
