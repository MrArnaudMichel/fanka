import { describe, expect, it } from 'vitest';
import { MAX_ANSWER_MS, activitySummary } from '~core/stats/activity';
import { NOW, anAttempt, local } from './fixtures';

const on = (d: number, over = {}) => anAttempt(`a${d}-${Math.random()}`, { at: local(9, d), ...over });

describe('activitySummary', () => {
  it('counts a streak ending today, or yesterday when today is still empty', () => {
    expect(activitySummary([on(27), on(28), on(29)], '30d', NOW).currentStreak).toBe(3);
    expect(activitySummary([on(27), on(28)], '30d', NOW).currentStreak).toBe(2);
    expect(activitySummary([on(26), on(28)], '30d', NOW).currentStreak).toBe(1);
    expect(activitySummary([on(20)], '30d', NOW).currentStreak).toBe(0);
  });

  it('finds the best streak anywhere in the history, window aside', () => {
    expect(activitySummary([on(1), on(2), on(3), on(4), on(10), on(29)], '7d', NOW).bestStreak).toBe(4);
  });

  it('sums time with each answer capped, and averages it', () => {
    const s = activitySummary([on(29, { durationMs: 10_000 }), on(29, { durationMs: 3_600_000 })], '7d', NOW);
    expect(s.totalMs).toBe(10_000 + MAX_ANSWER_MS);
    expect(s.averageMs).toBe((10_000 + MAX_ANSWER_MS) / 2);
    expect(s.answers).toBe(2);
    expect(s.daysStudied).toBe(1);
    expect(s.perStudyDay).toBe(2);
  });

  it('leaves answers outside the window out of the tiles', () => {
    expect(activitySummary([on(1), on(29)], '7d', NOW).answers).toBe(1);
  });

  it('splits time per bucket by source', () => {
    const s = activitySummary([on(29, { durationMs: 1000 }), on(29, { durationMs: 2000, source: 'practice' })], '7d', NOW);
    expect(s.time.at(-1)).toEqual({ key: '2026-09-29', scheduledMs: 1000, practiceMs: 2000 });
  });

  it('counts lesson time with practice', () => {
    const s = activitySummary([on(29, { durationMs: 1000 }), on(29, { durationMs: 2000, source: 'lesson' })], '7d', NOW);
    expect(s.time.at(-1)).toEqual({ key: '2026-09-29', scheduledMs: 1000, practiceMs: 2000 });
  });

  it('counts answers by hour and by mode', () => {
    const s = activitySummary([anAttempt('x', { at: local(9, 29, 8, 30), mode: 'review' }), anAttempt('y', { at: local(9, 28, 8, 5) })], '7d', NOW);
    expect(s.byHour[8]).toBe(2);
    expect(s.byMode).toEqual({ review: 1, writing: 1 });
  });

  it('lays out a year calendar ending today, with weekdays from Monday', () => {
    const s = activitySummary([on(29), on(29)], '7d', NOW);
    expect(s.calendar).toHaveLength(371);
    expect(s.calendar.at(-1)).toEqual({ date: '2026-09-29', count: 2, weekday: 1 }); // a Tuesday
  });

  it('is all zeros with no answers', () => {
    const s = activitySummary([], '30d', NOW);
    expect([s.currentStreak, s.bestStreak, s.answers, s.averageMs, s.perStudyDay]).toEqual([0, 0, 0, 0, 0]);
  });
});
