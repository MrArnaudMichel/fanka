import { describe, expect, it } from 'vitest';
import { formatDuration, formatPercent, shortDate } from '~/utils/format';

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
});
