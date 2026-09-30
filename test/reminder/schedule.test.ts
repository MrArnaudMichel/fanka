import { describe, expect, it } from 'vitest';
import { nextReminder } from '~core/reminder/schedule';

const local = (y: number, m: number, d: number, h = 0, min = 0) => new Date(y, m - 1, d, h, min).getTime();

describe('nextReminder', () => {
  it('is today when the time is still ahead', () => {
    expect(nextReminder(local(2026, 9, 16, 8), '19:00', 12, false)).toEqual({
      at: local(2026, 9, 16, 19),
      body: '12 cards due today',
    });
  });

  it('is tomorrow once the time has passed, with the generic body', () => {
    expect(nextReminder(local(2026, 9, 16, 20), '19:00', 12, false)).toEqual({
      at: local(2026, 9, 17, 19),
      body: "Time for today's cards",
    });
  });

  it('treats the exact minute as passed', () => {
    expect(nextReminder(local(2026, 9, 16, 19, 0), '19:00', 3, false)?.at).toBe(local(2026, 9, 17, 19));
  });

  it('uses the singular for one card', () => {
    expect(nextReminder(local(2026, 9, 16, 8), '19:00', 1, false)?.body).toBe('1 card due today');
  });

  it('is tomorrow when today is done', () => {
    expect(nextReminder(local(2026, 9, 16, 8), '19:00', 5, true)).toEqual({
      at: local(2026, 9, 17, 19),
      body: "Time for today's cards",
    });
  });

  it('is tomorrow when nothing is due', () => {
    expect(nextReminder(local(2026, 9, 16, 8), '19:30', 0, false)?.at).toBe(local(2026, 9, 17, 19, 30));
  });

  it('steps by calendar day across a month and year end', () => {
    expect(nextReminder(local(2026, 12, 31, 23), '07:15', 4, false)?.at).toBe(local(2027, 1, 1, 7, 15));
  });

  it('keeps the wall-clock time across a DST change', () => {
    // Whatever the runner's zone, a local-date step lands on 19:00 the next day.
    for (const [y, m, d] of [[2026, 3, 28], [2026, 3, 29], [2026, 10, 24], [2026, 10, 25], [2026, 11, 1]]) {
      const r = nextReminder(local(y, m, d, 20), '19:00', 2, false);
      expect(r).not.toBeNull();
      const at = new Date(r!.at);
      expect([at.getHours(), at.getMinutes()]).toEqual([19, 0]);
      expect(r!.at).toBe(local(y, m, d + 1, 19));
    }
  });

  it('returns null for a malformed time', () => {
    expect(nextReminder(local(2026, 9, 16, 8), '7pm', 3, false)).toBeNull();
    expect(nextReminder(local(2026, 9, 16, 8), '24:00', 3, false)).toBeNull();
  });
});
