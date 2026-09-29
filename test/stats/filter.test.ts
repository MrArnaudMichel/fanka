import { describe, expect, it } from 'vitest';
import { applyFilter } from '~core/stats/filter';
import { aCard, aDeck, anAttempt, anItem, aReview } from './fixtures';

describe('applyFilter', () => {
  const snapshot = {
    decks: [aDeck('d1'), aDeck('d2'), aDeck('gone', { deletedAt: 1 })],
    cards: [aCard('c1', 'd1'), aCard('c2', 'd2'), aCard('c3', 'gone'), aCard('c4', 'd1', { deletedAt: 1 })],
    items: [anItem('c1', 'production'), anItem('c1', 'recognition'), anItem('c2', 'production'), anItem('c3', 'production'), anItem('c4', 'production'), anItem('c2', 'recognition', { suspended: true })],
    reviews: [aReview('r1', 'c1:production'), aReview('r2', 'c2:production'), aReview('r3', 'c1:recognition')],
    attempts: [anAttempt('a1', { cardId: 'c1', deckId: 'd1', mode: 'writing' }), anAttempt('a2', { cardId: 'c2', deckId: 'd2', mode: 'review' })],
  };

  it('keeps live, unsuspended items only', () => {
    expect(applyFilter(snapshot, { deckId: null, mode: null }).items.map((i) => i.id).sort()).toEqual(['c1:production', 'c1:recognition', 'c2:production']);
  });

  it('narrows items, reviews and attempts to a deck and a mode', () => {
    const f = applyFilter(snapshot, { deckId: 'd1', mode: 'writing' });
    expect(f.items.map((i) => i.id)).toEqual(['c1:production']);
    expect(f.reviews.map((r) => r.id)).toEqual(['r1']);
    expect(f.attempts.map((a) => a.id)).toEqual(['a1']);
  });

  it('keeps every card and deck in the lookups, deleted ones included, for history', () => {
    const f = applyFilter(snapshot, { deckId: null, mode: null });
    expect(f.cardsById.has('c4')).toBe(true);
    expect(f.decksById.has('gone')).toBe(true);
  });
});
