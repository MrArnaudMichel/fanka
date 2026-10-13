import { describe, expect, it } from 'vitest';
import { addDays, startOfDayLocal } from '~core/stats/time';
import { knownCountAt, knownTimeline, milestoneProgress, weakWords, weekSummary } from '~core/stats/progress';
import { NOW, aCard, aReview, anAttempt, anItem, local } from './fixtures';

const cardsById = (cards: ReturnType<typeof aCard>[]) => new Map(cards.map((c) => [c.id, c]));

describe('knownTimeline', () => {
  it('counts cards whose recognition item is mature, and the distinct characters they cover', () => {
    const cards = [aCard('c1', 'd1', { hanzi: '學習' }), aCard('c2', 'd1', { hanzi: '學生' }), aCard('c3', 'd1', { hanzi: '老師' })];
    const items = [
      anItem('c1', 'recognition', { scheduledDays: 30 }),
      anItem('c2', 'recognition', { scheduledDays: 21 }),
      anItem('c3', 'recognition', { scheduledDays: 20 }),
      // Production direction never makes a word known.
      anItem('c3', 'production', { scheduledDays: 60 }),
    ];
    const t = knownTimeline(items, [], cardsById(cards), '30d', NOW);
    expect(t.known).toBe(2);
    expect(t.characters).toBe(3);
  });

  it('does not count a card still learning, whatever its interval', () => {
    const items = [anItem('c1', 'recognition', { state: 'relearning', scheduledDays: 40 })];
    expect(knownTimeline(items, [], cardsById([aCard('c1', 'd1')]), '30d', NOW).known).toBe(0);
  });

  it('rebuilds the count over time from the reviews', () => {
    const item = anItem('c1', 'recognition', { scheduledDays: 40 });
    // Answered 10 days ago, leaving a 25-day interval (read from the next review's `before`), then today.
    const reviews = [
      aReview('r1', item.id, { reviewedAt: local(9, 19) }),
      aReview('r2', item.id, { reviewedAt: local(9, 29, 9) }, { state: 'review', scheduledDays: 25 }),
    ];
    const t = knownTimeline([item], reviews, cardsById([aCard('c1', 'd1')]), '30d', NOW);
    const at = (day: number) => t.series.find((p) => p.key === `2026-09-${String(day).padStart(2, '0')}`)!.known;
    expect(at(18)).toBe(0);
    expect(at(19)).toBe(1);
    expect(at(29)).toBe(1);
  });
});

describe('knownCountAt', () => {
  it('reads an item as it stood after its last review before the moment', () => {
    const item = anItem('c1', 'recognition', { scheduledDays: 3, state: 'relearning' });
    const reviews = [
      aReview('r1', item.id, { reviewedAt: local(9, 10) }),
      aReview('r2', item.id, { reviewedAt: local(9, 20) }, { state: 'review', scheduledDays: 30 }),
    ];
    expect(knownCountAt([item], reviews, local(9, 15))).toBe(1);
    expect(knownCountAt([item], reviews, local(9, 25))).toBe(0);
    expect(knownCountAt([item], reviews, local(9, 5))).toBe(0);
  });
});

describe('milestoneProgress', () => {
  it('names the last milestone reached and the next one', () => {
    expect(milestoneProgress(48)).toEqual({ reached: 25, next: 50 });
    expect(milestoneProgress(50)).toEqual({ reached: 50, next: 100 });
    expect(milestoneProgress(3)).toEqual({ reached: null, next: 10 });
    expect(milestoneProgress(9000)).toEqual({ reached: 5000, next: null });
  });
});

describe('weekSummary', () => {
  it('compares the last seven days with the seven before', () => {
    const today = startOfDayLocal(NOW);
    const attempts = [
      anAttempt('a1', { at: NOW, durationMs: 120_000 }),
      anAttempt('a2', { at: addDays(today, -6) + 1000 }),
      anAttempt('a3', { at: addDays(today, -7) + 1000 }),
      anAttempt('a4', { at: addDays(today, -13) + 1000 }),
      anAttempt('a5', { at: addDays(today, -14) + 1000 }),
    ];
    const w = weekSummary(attempts, NOW);
    expect(w.thisWeek).toEqual({ answers: 2, ms: 65_000, days: 2 });
    expect(w.lastWeek).toEqual({ answers: 2, ms: 10_000, days: 2 });
  });
});

describe('weakWords', () => {
  const cards = cardsById([aCard('c1', 'd1', { hanzi: '學' }), aCard('c2', 'd1', { hanzi: '習' }), aCard('c3', 'd1', { hanzi: '書', deletedAt: 1 })]);

  it('ranks by wrong answers, scheduled and practice alike, then by failure rate', () => {
    const attempts = [
      anAttempt('a1', { cardId: 'c1', correct: false, source: 'practice' }),
      anAttempt('a2', { cardId: 'c1', correct: true }),
      anAttempt('a3', { cardId: 'c2', correct: false }),
      anAttempt('a4', { cardId: 'c2', correct: false, source: 'practice' }),
      anAttempt('a5', { cardId: 'c3', correct: false }),
    ];
    const weak = weakWords(attempts, cards, '30d', NOW);
    expect(weak.map((w) => w.cardId)).toEqual(['c2', 'c1']);
    expect(weak[0]).toMatchObject({ hanzi: '習', wrong: 2, total: 2 });
  });

  it('leaves out words never missed and answers outside the window', () => {
    const attempts = [anAttempt('a1', { cardId: 'c1' }), anAttempt('a2', { cardId: 'c2', correct: false, at: local(1, 1) })];
    expect(weakWords(attempts, cards, '30d', NOW)).toEqual([]);
  });
});
