import { describe, expect, it } from 'vitest';
import { deckComparison } from '~core/stats/decks';
import { applyFilter } from '~core/stats/filter';
import { NOW, aCard, aDeck, aReview, anAttempt, anItem, local } from './fixtures';

describe('deckComparison', () => {
  const snapshot = {
    decks: [aDeck('d1', { name: 'HSK 1' }), aDeck('d2', { name: 'Food' }), aDeck('gone', { deletedAt: 1 })],
    cards: [aCard('c1', 'd1'), aCard('c2', 'd1'), aCard('c3', 'd1'), aCard('c4', 'd2'), aCard('c5', 'd1', { deletedAt: 1 })],
    items: [
      anItem('c1', 'recognition', { scheduledDays: 30 }),
      anItem('c2', 'recognition', { state: 'learning', scheduledDays: 0 }),
      anItem('c3', 'recognition', { state: 'new', scheduledDays: 0 }),
      anItem('c4', 'recognition', { state: 'relearning', scheduledDays: 1 }),
      anItem('c1', 'production', { scheduledDays: 2 }),
    ],
    reviews: [
      aReview('r1', 'c1:recognition', { grade: 3 }, { state: 'review', scheduledDays: 25 }),
      aReview('r2', 'c1:recognition', { grade: 1 }, { state: 'review', scheduledDays: 25 }),
      aReview('r3', 'c4:recognition', { grade: 3 }, { state: 'review', scheduledDays: 5 }),
    ],
    attempts: [
      anAttempt('a1', { cardId: 'c2', deckId: 'd1', source: 'practice', correct: true }),
      anAttempt('a2', { cardId: 'c2', deckId: 'd1', source: 'practice', correct: false }),
      anAttempt('a3', { cardId: 'c3', deckId: 'd1', source: 'practice', correct: true }),
      anAttempt('a4', { cardId: 'c1', deckId: 'd1', source: 'scheduled' }),
      anAttempt('a5', { cardId: 'c4', deckId: 'd2', source: 'practice', at: local(1, 1) }),
    ],
  };
  const rows = deckComparison(applyFilter(snapshot, { deckId: null, mode: null }), '30d', NOW);

  it('has one row per live deck, by name', () => {
    expect(rows.map((r) => r.deckId)).toEqual(['d2', 'd1']);
  });

  it('counts words by the state of their recognition item', () => {
    expect(rows.find((r) => r.deckId === 'd1')).toMatchObject({ name: 'HSK 1', words: 3, known: 1, learning: 1, new: 1 });
    expect(rows.find((r) => r.deckId === 'd2')).toMatchObject({ words: 1, known: 0, learning: 1, new: 0 });
  });

  it('reads mature retention and practice in the window', () => {
    const d1 = rows.find((r) => r.deckId === 'd1')!;
    expect(d1.retention).toEqual({ right: 1, total: 2 });
    expect(d1.practised).toBe(2);
    expect(d1.practice).toEqual({ right: 2, total: 3 });
    const d2 = rows.find((r) => r.deckId === 'd2')!;
    expect(d2.retention).toEqual({ right: 0, total: 0 });
    expect(d2.practised).toBe(0);
  });
});
