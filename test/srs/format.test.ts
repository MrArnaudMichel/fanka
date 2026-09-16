import { describe, expect, it } from 'vitest';
import { formatInterval } from '~core/srs/format';

const MIN = 60_000;
const HOUR = 3_600_000;
const DAY = 86_400_000;

describe('formatInterval', () => {
  it('shows minutes below an hour', () => {
    expect(formatInterval(10 * MIN)).toBe('10 min');
  });

  it('never shows less than one minute', () => {
    expect(formatInterval(5_000)).toBe('1 min');
  });

  it('shows hours below a day', () => {
    expect(formatInterval(5 * HOUR)).toBe('5 h');
  });

  it('shows whole days below a month', () => {
    expect(formatInterval(12 * DAY)).toBe('12 d');
  });

  it('shows months below a year', () => {
    expect(formatInterval(90 * DAY)).toBe('3.0 mo');
  });

  it('shows years beyond that', () => {
    expect(formatInterval(420 * DAY)).toBe('1.2 y');
  });
});
