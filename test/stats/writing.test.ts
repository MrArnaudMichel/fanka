import { describe, expect, it } from 'vitest';
import type { WritingResult } from '~core/db/schema';
import { writingSummary } from '~core/stats/writing';
import { NOW, anAttempt, local } from './fixtures';

const r = (character: string, over: Partial<WritingResult> = {}): WritingResult => ({
  character, shapeCorrect: true, orderCorrect: true, error: null, strokeIndex: null, expected: 4, drawn: 4, ...over,
});

describe('writingSummary', () => {
  const attempts = [
    anAttempt('a', { checked: true, writing: [r('學'), r('習', { orderCorrect: false, error: 'stroke-order', strokeIndex: 1 })] }),
    anAttempt('b', { checked: true, writing: [r('習', { shapeCorrect: false, orderCorrect: false, error: 'stroke-count', drawn: 3 })], at: NOW + 1 }),
    anAttempt('c', { checked: false, writing: null }),
    anAttempt('d', { mode: 'review' }),
  ];

  it('measures the character over drawn characters, and the order over right shapes', () => {
    const s = writingSummary(attempts, '30d', NOW);
    expect(s.character).toEqual({ right: 2, total: 3 });
    expect(s.order).toEqual({ right: 1, total: 2 });
    expect(s.checked).toEqual({ right: 2, total: 3 });
  });

  it('counts each kind of error', () => {
    expect(writingSummary(attempts, '30d', NOW).errors).toEqual({ 'stroke-count': 1, 'stroke-shape': 0, 'stroke-order': 1, 'stroke-direction': 0 });
  });

  it('lists the characters missed most, with their last error', () => {
    expect(writingSummary(attempts, '30d', NOW).missed).toEqual([
      { character: '習', attempts: 2, shapeRate: 0.5, orderRate: 0, lastError: 'stroke-count', lastAt: NOW + 1 },
    ]);
  });

  it('ignores answers outside the window', () => {
    expect(writingSummary([anAttempt('old', { at: local(1, 1), checked: true, writing: [r('學')] })], '30d', NOW).character.total).toBe(0);
  });
});
