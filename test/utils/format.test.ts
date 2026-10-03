import { describe, expect, it } from 'vitest';
import { formatBytes, formatDuration, formatPercent, plural, shortDate } from '~/utils/format';

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
