import { describe, expect, it } from 'vitest';
import type { WritingResult } from '~core/db/schema';
import { cardsContaining, writingSummary } from '~core/stats/writing';
import { NOW, aCard, anAttempt, local } from './fixtures';

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
      { character: '習', attempts: 2, shapeRate: 0.5, orderRate: 0, lastError: 'stroke-count', lastAt: NOW + 1, lastRightAt: null },
    ]);
  });

  it('ignores answers outside the window', () => {
    expect(writingSummary([anAttempt('old', { at: local(1, 1), checked: true, writing: [r('學')] })], '30d', NOW).character.total).toBe(0);
  });

  it('keeps the last time a missed character was drawn right, shape and order', () => {
    const later = [...attempts, anAttempt('e', { checked: true, writing: [r('習')], at: NOW + 2 })];
    expect(writingSummary(later, '30d', NOW + 2).missed[0]).toMatchObject({ character: '習', lastRightAt: NOW + 2 });
  });
});

describe('cardsContaining', () => {
  it('finds the live cards holding each character', () => {
    const cards = [aCard('c1', 'd1', { hanzi: '學習' }), aCard('c2', 'd1', { hanzi: '學生' }), aCard('c3', 'd1', { hanzi: '學', deletedAt: 1 })];
    const found = cardsContaining(['學', '習', '書'], new Map(cards.map((c) => [c.id, c])));
    expect(found.get('學')).toEqual(['c1', 'c2']);
    expect(found.get('習')).toEqual(['c1']);
    expect(found.get('書')).toEqual([]);
  });
});
