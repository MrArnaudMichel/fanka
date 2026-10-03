import { describe, expect, it } from 'vitest';
import { GENERIC_BODY, MAX_REMINDER_TIMES, nextReminders, normaliseTimes } from '~core/reminder/schedule';

const local = (y: number, m: number, d: number, h = 0, min = 0) => new Date(y, m - 1, d, h, min).getTime();
const EVERY_DAY = [0, 1, 2, 3, 4, 5, 6];
// 2026-09-16 is a Wednesday.

describe('normaliseTimes', () => {
  it('drops invalid times, dedupes and sorts', () => {
    expect(normaliseTimes(['19:00', '7:00', '08:30', '19:00', '24:00'])).toEqual(['08:30', '19:00']);
  });

  it('keeps at most MAX_REMINDER_TIMES, the earliest', () => {
    expect(MAX_REMINDER_TIMES).toBe(4);
    expect(normaliseTimes(['21:00', '07:00', '12:00', '08:00', '19:00', '15:00'])).toEqual(['07:00', '08:00', '12:00', '15:00']);
  });
});

describe('nextReminders', () => {
  it('schedules every time on every allowed day for a week, today first with the count', () => {
    const list = nextReminders(local(2026, 9, 16, 8), ['19:00'], EVERY_DAY, 12, false);
    expect(list).toHaveLength(7);
    expect(list[0]).toEqual({ at: local(2026, 9, 16, 19), body: '12 cards due today' });
    expect(list[1]).toEqual({ at: local(2026, 9, 17, 19), body: GENERIC_BODY });
    expect(list[6]!.at).toBe(local(2026, 9, 22, 19));
  });

  it('skips today when today is done or nothing is due, and past times', () => {
    expect(nextReminders(local(2026, 9, 16, 8), ['19:00'], EVERY_DAY, 5, true)[0]!.at).toBe(local(2026, 9, 17, 19));
    expect(nextReminders(local(2026, 9, 16, 8), ['19:00'], EVERY_DAY, 0, false)[0]!.at).toBe(local(2026, 9, 17, 19));
    expect(nextReminders(local(2026, 9, 16, 19, 0), ['19:00'], EVERY_DAY, 3, false)[0]!.at).toBe(local(2026, 9, 17, 19));
  });

  it('keeps several times a day in order', () => {
    const list = nextReminders(local(2026, 9, 16, 9), ['20:00', '08:00'], EVERY_DAY, 4, false);
    expect(list.slice(0, 3).map((r) => r.at)).toEqual([local(2026, 9, 16, 20), local(2026, 9, 17, 8), local(2026, 9, 17, 20)]);
    expect(list[0]!.body).toBe('4 cards due today');
  });

  it('only uses the allowed days of the week', () => {
    // Weekdays only, from a Friday evening: next is Monday.
    const list = nextReminders(local(2026, 9, 18, 21), ['19:00'], [1, 2, 3, 4, 5], 4, false);
    expect(list[0]!.at).toBe(local(2026, 9, 21, 19));
    expect(list.every((r) => ![0, 6].includes(new Date(r.at).getDay()))).toBe(true);
  });

  it('is empty without a valid time or an allowed day', () => {
    expect(nextReminders(local(2026, 9, 16, 8), ['nope'], EVERY_DAY, 1, false)).toEqual([]);
    expect(nextReminders(local(2026, 9, 16, 8), ['19:00'], [], 1, false)).toEqual([]);
  });

  it('keeps the wall-clock time across a DST change', () => {
    // Europe/Paris-style change on 2026-10-25 when the test zone has one; the local reading must stay 19:00.
    const list = nextReminders(local(2026, 10, 22, 8), ['19:00'], EVERY_DAY, 1, false);
    expect(list.every((r) => new Date(r.at).getHours() === 19 && new Date(r.at).getMinutes() === 0)).toBe(true);
  });

  it('uses the singular for one card', () => {
    expect(nextReminders(local(2026, 9, 16, 8), ['19:00'], EVERY_DAY, 1, false)[0]!.body).toBe('1 card due today');
  });
});
