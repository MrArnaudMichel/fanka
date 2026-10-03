import { describe, expect, it } from 'vitest';
import { formatBytes, formatDuration, formatPercent, plural, shortDate, timeAgo, whenLabel } from '~/utils/format';

describe('format', () => {
  it('formats durations', () => {
    expect([formatDuration(8_000), formatDuration(720_000), formatDuration(11_100_000), formatDuration(7_200_000)]).toEqual(['8 s', '12 min', '3 h 5 min', '2 h']);
  });
  it('formats percentages', () => {
    expect([formatPercent(null), formatPercent(0.874)]).toEqual(['—', '87%']);
  });
  it('shortens a day key', () => {
    expect(shortDate('2026-09-03')).toBe('9/3');
  });
  it('pluralises a count with its noun', () => {
    expect([plural(0, 'answer'), plural(1, 'answer'), plural(2, 'answer')]).toEqual(['0 answers', '1 answer', '2 answers']);
  });
});

describe('formatBytes', () => {
  it('reads in the largest whole unit', () => {
    expect(formatBytes(0)).toBe('0 B');
    expect(formatBytes(512)).toBe('512 B');
    expect(formatBytes(1536)).toBe('1.5 kB');
    expect(formatBytes(12 * 1000 * 1000)).toBe('12 MB');
  });
});

describe('timeAgo', () => {
  const now = new Date(2026, 9, 3, 18, 0).getTime();
  const MIN = 60_000;
  it('reads the elapsed time in the largest whole unit, as English copy', () => {
    expect(timeAgo(now - 20 * 1000, now)).toBe('just now');
    expect(timeAgo(now - 1 * MIN, now)).toBe('1 min ago');
    expect(timeAgo(now - 42 * MIN, now)).toBe('42 min ago');
    expect(timeAgo(now - 3 * 60 * MIN, now)).toBe('3 h ago');
    expect(timeAgo(now - 30 * 60 * MIN, now)).toBe('yesterday');
    expect(timeAgo(now - 4 * 24 * 60 * MIN, now)).toBe('4 days ago');
  });
  it('treats a time in the future (a skewed clock) as just now', () => {
    expect(timeAgo(now + 5 * MIN, now)).toBe('just now');
  });
});

describe('whenLabel', () => {
  // 2026-10-03 is a Saturday.
  const now = new Date(2026, 9, 3, 18, 0).getTime();
  const at = (d: number, h: number, m = 0) => new Date(2026, 9, d, h, m).getTime();
  it('says today, tomorrow, or the weekday, with a 24-hour time', () => {
    expect(whenLabel(at(3, 19), now, 'en-GB')).toBe('today at 19:00');
    expect(whenLabel(at(4, 8, 30), now, 'en-GB')).toBe('tomorrow at 08:30');
    expect(whenLabel(at(6, 19), now, 'en-GB')).toBe('Tue at 19:00');
  });
});
