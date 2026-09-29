/**
 * Calendar arithmetic for statistics, in the learner's local time. Days are
 * stepped with `setDate`, never by adding 24 h, so a daylight-saving change
 * never shifts a bucket off midnight.
 */
export const DAY_MS = 86_400_000;

export type StatsWindow = '7d' | '30d' | '90d' | '1y' | 'all';

const WINDOW_DAYS: Record<Exclude<StatsWindow, 'all'>, number> = { '7d': 7, '30d': 30, '90d': 90, '1y': 365 };

export function startOfDayLocal(ms: number): number {
  const d = new Date(ms);
  d.setHours(0, 0, 0, 0);
  return d.getTime();
}

export function addDays(ms: number, days: number): number {
  const d = new Date(ms);
  d.setDate(d.getDate() + days);
  return d.getTime();
}

export function dayKey(ms: number): string {
  const d = new Date(ms);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

/** The first instant a window covers — today included. `0` for All. */
export function windowStart(window: StatsWindow, now: number): number {
  if (window === 'all') return 0;
  return addDays(startOfDayLocal(now), -(WINDOW_DAYS[window] - 1));
}

export function inWindow(at: number, window: StatsWindow, now: number): boolean {
  return at >= windowStart(window, now) && at < addDays(startOfDayLocal(now), 1);
}

export interface Bucket {
  /** `dayKey` of the bucket's first day. */
  key: string;
  start: number;
  end: number;
}

/**
 * Where a time series puts its points: one per day for 7 and 30 days, one
 * per 7 days otherwise, counted back from today so the newest bucket is
 * always whole and the oldest is clipped to the window. All starts on the
 * day of the first answer, and has no buckets without one.
 */
export function timeBuckets(window: StatsWindow, now: number, earliest: number | null): Bucket[] {
  const end = addDays(startOfDayLocal(now), 1);
  if (window === 'all' && earliest === null) return [];
  const start = window === 'all' ? startOfDayLocal(earliest!) : windowStart(window, now);
  const step = window === '7d' || window === '30d' ? 1 : 7;
  const buckets: Bucket[] = [];
  for (let cursor = end; cursor > start; cursor = addDays(cursor, -step)) {
    const bucketStart = Math.max(start, addDays(cursor, -step));
    buckets.unshift({ key: dayKey(bucketStart), start: bucketStart, end: cursor });
  }
  return buckets;
}

/** Index of the bucket holding `at`, or -1. Binary search: buckets are sorted and contiguous. */
export function findBucket(buckets: readonly Bucket[], at: number): number {
  let lo = 0;
  let hi = buckets.length - 1;
  while (lo <= hi) {
    const mid = (lo + hi) >> 1;
    const b = buckets[mid]!;
    if (at < b.start) hi = mid - 1;
    else if (at >= b.end) lo = mid + 1;
    else return mid;
  }
  return -1;
}
