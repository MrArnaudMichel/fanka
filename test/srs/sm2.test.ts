import { describe, expect, it } from 'vitest';
import { newSrsState } from '~core/srs/scheduler';
import { createSm2Scheduler } from '~core/srs/sm2';
import { GRADES, type SchedulerSettings } from '~core/srs/types';

const NOW = Date.parse('2026-09-16T08:00:00Z');
const DAY = 86_400_000;
const settings: SchedulerSettings = { desiredRetention: 0.9, maxInterval: 365 };
const scheduler = createSm2Scheduler();

const reviewing = (over: Partial<ReturnType<typeof newSrsState>> = {}) => ({
  ...newSrsState(NOW),
  state: 'review' as const,
  difficulty: 2.5,
  scheduledDays: 10,
  reps: 5,
  ...over,
});

describe('SM-2 scheduler', () => {
  it('gives a new card one day on Good', () => {
    const next = scheduler.apply(newSrsState(NOW), 3, NOW, settings);
    expect(next.scheduledDays).toBe(1);
    expect(next.state).toBe('learning');
  });

  it('gives the second Good six days', () => {
    const second = { ...newSrsState(NOW), state: 'learning' as const, reps: 1, scheduledDays: 1, difficulty: 2.5 };
    expect(scheduler.apply(second, 3, NOW, settings).scheduledDays).toBe(6);
  });

  it('multiplies by the ease factor from the third review on', () => {
    const next = scheduler.apply(reviewing(), 3, NOW, settings);
    expect(next.scheduledDays).toBe(25); // round(10 * 2.5)
  });

  it('resets the interval and counts a lapse on Again', () => {
    const next = scheduler.apply(reviewing(), 1, NOW, settings);
    expect(next.scheduledDays).toBe(0);
    expect(next.lapses).toBe(1);
    expect(next.state).toBe('relearning');
  });

  it('lowers the ease on Hard and raises it on Easy', () => {
    expect(scheduler.apply(reviewing(), 2, NOW, settings).difficulty).toBeLessThan(2.5);
    expect(scheduler.apply(reviewing(), 4, NOW, settings).difficulty).toBeGreaterThan(2.5);
  });

  it('never lets the ease fall below 1.3', () => {
    let state = reviewing({ difficulty: 1.3 });
    for (let i = 0; i < 10; i += 1) state = scheduler.apply(state, 1, NOW, settings);
    expect(state.difficulty).toBeGreaterThanOrEqual(1.3);
  });

  it('respects the maximum interval', () => {
    const next = scheduler.apply(reviewing({ scheduledDays: 300 }), 4, NOW, { desiredRetention: 0.9, maxInterval: 60 });
    expect(next.scheduledDays).toBeLessThanOrEqual(60);
  });

  it('applies exactly what it previewed', () => {
    const state = reviewing();
    const preview = scheduler.preview(state, NOW, settings);
    for (const grade of GRADES) {
      expect(scheduler.apply(state, grade, NOW, settings)).toEqual(preview[grade]);
    }
  });

  it('sets due from the interval it computed', () => {
    const next = scheduler.apply(reviewing(), 3, NOW, settings);
    expect(next.due).toBe(NOW + next.scheduledDays * DAY);
  });
});
