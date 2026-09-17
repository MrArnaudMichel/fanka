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

  // A value close enough to a unit's ceiling to round up into it must read
  // in the next unit, not display that ceiling itself (e.g. "60 min").
  // Against cc3e737's implementation, which compared the *raw* value to
  // each threshold instead of the rounded one: 59.9 min rendered "60 min",
  // 30.6 d rendered "31 d" (immediately followed by "1.0 mo" at 31.0 d,
  // rather than rolling over at the same point), and 364.9 d rendered
  // "12.0 mo" instead of "1.0 y".
  it('rolls a value that rounds up to 60 minutes over into hours', () => {
    expect(formatInterval(59.9 * MIN)).toBe('1 h');
  });

  it('rolls a value that rounds up to 31 days over into months', () => {
    expect(formatInterval(30.6 * DAY)).toBe('1.0 mo');
  });

  it('rolls a value that rounds up to 12 months over into years', () => {
    expect(formatInterval(364.9 * DAY)).toBe('1.0 y');
  });
});
