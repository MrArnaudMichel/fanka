import { describe, expect, it } from 'vitest';
import { memorySummary, rate } from '~core/stats/memory';
import { NOW, aCard, aReview, anItem, local } from './fixtures';

const DAY = 86_400_000;

function input(reviews = [] as ReturnType<typeof aReview>[], items = [anItem('c1', 'production')]) {
  return {
    reviews,
    items,
    itemsById: new Map(items.map((i) => [i.id, i])),
    cardsById: new Map([['c1', aCard('c1', 'd1')], ['c2', aCard('c2', 'd1', { hanzi: '習' })]]),
  };
}

describe('memorySummary', () => {
  it('measures retention on review-state answers only, young and mature apart', () => {
    const s = memorySummary(input([
      aReview('r1', 'c1:production', { grade: 3 }, { scheduledDays: 5 }),
      aReview('r2', 'c1:production', { grade: 1 }, { scheduledDays: 5 }),
      aReview('r3', 'c1:production', { grade: 4 }, { scheduledDays: 40 }),
      aReview('r4', 'c1:production', { grade: 1 }, { state: 'learning' }),
    ]), '30d', NOW);
    expect(s.retention).toEqual({ young: { right: 1, total: 2 }, mature: { right: 1, total: 1 } });
    expect(rate(s.retention.young)).toBe(0.5);
    expect(rate({ right: 0, total: 0 })).toBeNull();
  });

  it('leaves reviews outside the window out of retention and the answer mix', () => {
    const s = memorySummary(input([aReview('r1', 'c1:production', { reviewedAt: local(1, 1) })]), '30d', NOW);
    expect(s.retention.young.total).toBe(0);
    expect(s.answerMix).toEqual({ again: 0, hard: 0, good: 0, easy: 0 });
  });

  it('forecasts 30 days, overdue counted today, new items left out', () => {
    const items = [
      anItem('c1', 'production', { due: NOW - 5 * DAY }),
      anItem('c1', 'recognition', { due: NOW + 2 * DAY }),
      anItem('c2', 'production', { state: 'new', due: NOW }),
      anItem('c2', 'recognition', { due: NOW + 60 * DAY }),
    ];
    const s = memorySummary(input([], items), '30d', NOW);
    expect(s.forecast).toHaveLength(30);
    expect(s.forecast[0]).toEqual({ date: '2026-09-29', count: 1 });
    expect(s.forecast[2]!.count).toBe(1);
    expect(s.forecast.reduce((n, d) => n + d.count, 0)).toBe(2);
  });

  it('buckets the intervals of review items', () => {
    const items = [1, 3, 5, 10, 20, 60, 200].map((d, i) => anItem(`c${i}`, 'production', { scheduledDays: d }));
    const s = memorySummary(input([], items), '30d', NOW);
    expect(s.intervals.map((b) => b.count)).toEqual([1, 1, 1, 1, 1, 1, 1]);
    expect(s.intervals.map((b) => b.label)).toEqual(['1 d', '2–3 d', '4–7 d', '8–14 d', '15–30 d', '1–3 mo', 'Over 3 mo']);
  });

  it('counts card states', () => {
    const items = [anItem('c1', 'production', { state: 'new' }), anItem('c1', 'recognition', { state: 'relearning' }), anItem('c2', 'production', { scheduledDays: 30 }), anItem('c2', 'recognition')];
    expect(memorySummary(input([], items), '30d', NOW).cardStates).toEqual({ new: 1, learning: 1, young: 1, mature: 1 });
  });

  it('ranks the hardest items by lapses, then by failure rate', () => {
    const items = [anItem('c1', 'production', { lapses: 1 }), anItem('c2', 'production', { lapses: 3 })];
    const reviews = [aReview('r1', 'c1:production', { grade: 1 }), aReview('r2', 'c2:production', { grade: 3 })];
    const s = memorySummary(input(reviews, items), '30d', NOW);
    expect(s.hardest.map((h) => [h.hanzi, h.lapses, h.failures, h.reviews])).toEqual([['習', 3, 0, 1], ['學', 1, 1, 1]]);
  });
});
