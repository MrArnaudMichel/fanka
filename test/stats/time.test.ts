import { describe, expect, it } from 'vitest';
import { addDays, dayKey, findBucket, startOfDayLocal, timeBuckets, windowStart } from '~core/stats/time';

const local = (m: number, d: number, h = 10) => new Date(2026, m - 1, d, h).getTime();
const NOW = local(9, 29);

describe('time helpers', () => {
  it('steps whole local days, landing on midnight even across a clock change', () => {
    const start = startOfDayLocal(local(3, 1));
    for (let i = 1; i <= 300; i += 1) expect(new Date(addDays(start, i)).getHours()).toBe(0);
  });

  it('keys a day in local time', () => {
    expect(dayKey(local(9, 3, 23))).toBe('2026-09-03');
  });

  it('opens a 7-day window six days before today', () => {
    expect(windowStart('7d', NOW)).toBe(startOfDayLocal(local(9, 23)));
    expect(windowStart('all', NOW)).toBe(0);
  });
});

describe('timeBuckets', () => {
  it('buckets by day for short windows, oldest first, ending today', () => {
    const buckets = timeBuckets('7d', NOW, null);
    expect(buckets).toHaveLength(7);
    expect(buckets[0]!.key).toBe('2026-09-23');
    expect(buckets[6]!.key).toBe('2026-09-29');
  });

  it('buckets by week for long windows, clipping the oldest', () => {
    const buckets = timeBuckets('90d', NOW, null);
    expect(buckets).toHaveLength(13);
    expect(buckets[0]!.start).toBe(windowStart('90d', NOW));
    expect(buckets.at(-1)!.end).toBe(addDays(startOfDayLocal(NOW), 1));
  });

  it('starts All at the first answer, and is empty without one', () => {
    expect(timeBuckets('all', NOW, null)).toEqual([]);
    expect(timeBuckets('all', NOW, local(9, 1))[0]!.start).toBe(startOfDayLocal(local(9, 1)));
  });

  it('finds the bucket an instant falls in', () => {
    const buckets = timeBuckets('7d', NOW, null);
    expect(findBucket(buckets, local(9, 25, 12))).toBe(2);
    expect(findBucket(buckets, local(9, 1))).toBe(-1);
  });
});
