import { describe, expect, it } from 'vitest';
import { type InsightInput, insights } from '~core/stats/insights';
import { addDays, startOfDayLocal } from '~core/stats/time';
import { NOW, aReview, anAttempt, anItem, local } from './fixtures';

const DAY = 86_400_000;

const base = (over: Partial<InsightInput> = {}): InsightInput => ({
  reviews: [],
  attempts: [],
  items: [],
  missedCharacter: null,
  window: '30d',
  now: NOW,
  ...over,
});

/** `n` mature reviews `daysAgo` days back, `right` of them right. */
const matureReviews = (prefix: string, n: number, right: number, daysAgo: number) =>
  Array.from({ length: n }, (_, i) =>
    aReview(`${prefix}${i}`, 'c1:recognition', { grade: i < right ? 3 : 1, reviewedAt: NOW - daysAgo * DAY }, { state: 'review', scheduledDays: 30 }),
  );

describe('insights', () => {
  it('says nothing without enough to go on', () => {
    expect(insights(base())).toEqual([]);
  });

  it('reports a move in mature retention of three points or more', () => {
    const reviews = [...matureReviews('old', 20, 16, 45), ...matureReviews('new', 20, 19, 10)];
    expect(insights(base({ reviews })).map((i) => i.text)).toContain('Mature retention rose from 80% to 95% this month');
  });

  it('stays quiet on a small move or a thin month', () => {
    const small = [...matureReviews('old', 20, 18, 45), ...matureReviews('new', 20, 18, 10)];
    const thin = [...matureReviews('old', 20, 10, 45), ...matureReviews('new', 5, 5, 10)];
    expect(insights(base({ reviews: small }))).toEqual([]);
    expect(insights(base({ reviews: thin }))).toEqual([]);
  });

  it('celebrates a milestone reached this week, with its day', () => {
    const items = Array.from({ length: 10 }, (_, i) => anItem(`c${i}`, 'recognition', { scheduledDays: 30 }));
    const reviews = items.map((item, i) =>
      aReview(`r${i}`, item.id, { reviewedAt: i < 9 ? local(9, 1) : local(9, 27, 15) }),
    );
    expect(insights(base({ items, reviews })).map((i) => i.text)).toContain('You reached 10 known words on 27 Sept');
  });

  it('names the character missed most once it was drawn three times', () => {
    expect(insights(base({ missedCharacter: { character: '學', attempts: 3 } })).map((i) => i.text)).toEqual(['學 is the character you miss most']);
    expect(insights(base({ missedCharacter: { character: '學', attempts: 2 } }))).toEqual([]);
  });

  it('finds the busiest hour after thirty answers', () => {
    const attempts = Array.from({ length: 30 }, (_, i) => anAttempt(`a${i}`, { at: local(9, 20 + (i % 9), i < 20 ? 20 : 8) }));
    expect(insights(base({ attempts })).map((i) => i.text)).toEqual(['You study most around 20:00']);
  });

  it('counts the cards due tomorrow', () => {
    const tomorrow = addDays(startOfDayLocal(NOW), 1) + 3600_000;
    const items = [anItem('c1', 'production', { due: tomorrow }), anItem('c2', 'production', { due: tomorrow }), anItem('c3', 'production', { due: NOW })];
    expect(insights(base({ items })).map((i) => i.text)).toEqual(['2 cards are due tomorrow']);
  });

  it('keeps at most four, in order', () => {
    const items = [
      ...Array.from({ length: 10 }, (_, i) => anItem(`c${i}`, 'recognition', { scheduledDays: 30 })),
      anItem('d1', 'production', { due: addDays(startOfDayLocal(NOW), 1) + 1 }),
    ];
    const reviews = [
      ...matureReviews('old', 20, 16, 45),
      ...matureReviews('new', 20, 19, 10),
      ...items.slice(0, 10).map((item, i) => aReview(`k${i}`, item.id, { reviewedAt: i < 9 ? local(9, 1) : local(9, 27, 15) })),
    ];
    const attempts = Array.from({ length: 30 }, (_, i) => anAttempt(`a${i}`, { at: local(9, 20, 20) }));
    const texts = insights(base({ items, reviews, attempts, missedCharacter: { character: '學', attempts: 5 } })).map((i) => i.text);
    expect(texts).toHaveLength(4);
    expect(texts[0]).toMatch(/^Mature retention/);
    expect(texts[3]).toBe('You study most around 20:00');
  });
});
