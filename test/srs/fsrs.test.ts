import { describe, expect, it } from 'vitest';
import { createFsrsScheduler } from '~core/srs/fsrs';
import { newSrsState } from '~core/srs/scheduler';
import { GRADES, type SchedulerSettings } from '~core/srs/types';

const NOW = Date.parse('2026-09-16T08:00:00Z');
const settings: SchedulerSettings = { desiredRetention: 0.9, maxInterval: 365 };
const scheduler = createFsrsScheduler();

describe('FSRS scheduler', () => {
  it('starts a card in the new state, due now', () => {
    const fresh = newSrsState(NOW);
    expect(fresh.state).toBe('new');
    expect(fresh.due).toBe(NOW);
    expect(fresh.reps).toBe(0);
  });

  it('previews all four grades', () => {
    const preview = scheduler.preview(newSrsState(NOW), NOW, settings);
    expect(Object.keys(preview).map(Number).sort()).toEqual([1, 2, 3, 4]);
  });

  it('orders the intervals: Again <= Hard <= Good <= Easy', () => {
    const state = { ...newSrsState(NOW), state: 'review' as const, stability: 12, difficulty: 5, reps: 9, due: NOW };
    const preview = scheduler.preview(state, NOW, settings);
    const dues = GRADES.map((g) => preview[g]!.due);
    expect(dues[0]).toBeLessThanOrEqual(dues[1]!);
    expect(dues[1]).toBeLessThanOrEqual(dues[2]!);
    expect(dues[2]).toBeLessThanOrEqual(dues[3]!);
  });

  it('applies exactly what it previewed — the button never lies', () => {
    const state = { ...newSrsState(NOW), state: 'review' as const, stability: 12, difficulty: 5, reps: 9 };
    const preview = scheduler.preview(state, NOW, settings);
    for (const grade of GRADES) {
      expect(scheduler.apply(state, grade, NOW, settings)).toEqual(preview[grade]);
    }
  });

  it('counts a lapse only on Again', () => {
    const state = { ...newSrsState(NOW), state: 'review' as const, stability: 12, difficulty: 5, reps: 9 };
    expect(scheduler.apply(state, 1, NOW, settings).lapses).toBe(1);
    expect(scheduler.apply(state, 3, NOW, settings).lapses).toBe(0);
  });

  it('increments reps on every grade', () => {
    const state = newSrsState(NOW);
    for (const grade of GRADES) {
      expect(scheduler.apply(state, grade, NOW, settings).reps).toBe(1);
    }
  });

  it('never schedules beyond the maximum interval', () => {
    const state = { ...newSrsState(NOW), state: 'review' as const, stability: 5000, difficulty: 1, reps: 90 };
    const capped = scheduler.apply(state, 4, NOW, { desiredRetention: 0.9, maxInterval: 30 });
    const days = (capped.due - NOW) / 86_400_000;
    expect(days).toBeLessThanOrEqual(30.001);
  });

  it('schedules sooner when a higher retention is demanded', () => {
    const state = { ...newSrsState(NOW), state: 'review' as const, stability: 20, difficulty: 5, reps: 10 };
    const relaxed = scheduler.apply(state, 3, NOW, { desiredRetention: 0.8, maxInterval: 365 });
    const strict = scheduler.apply(state, 3, NOW, { desiredRetention: 0.95, maxInterval: 365 });
    expect(strict.due).toBeLessThan(relaxed.due);
  });

  it('is deterministic — two identical calls agree', () => {
    const state = { ...newSrsState(NOW), state: 'review' as const, stability: 12, difficulty: 5, reps: 9 };
    expect(scheduler.apply(state, 3, NOW, settings)).toEqual(scheduler.apply(state, 3, NOW, settings));
  });
});
