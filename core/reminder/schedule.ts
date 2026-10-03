export interface Reminder {
  /** Epoch milliseconds of the notification. */
  at: number;
  body: string;
}

export const GENERIC_BODY = "Time for today's cards";

const TIME = /^([01]\d|2[0-3]):([0-5]\d)$/;

/** The local-time clock reading of `day` at `time`; day arithmetic goes through Date so DST cannot skew it. */
function occurrence(now: number, dayOffset: number, hour: number, minute: number): number {
  const d = new Date(now);
  return new Date(d.getFullYear(), d.getMonth(), d.getDate() + dayOffset, hour, minute, 0, 0).getTime();
}

function dueBody(count: number): string {
  return count === 1 ? '1 card due today' : `${count} cards due today`;
}

/** Most times a day; with the 7-day horizon it keeps scheduled ids inside 100–199. */
export const MAX_REMINDER_TIMES = 4;

/** Valid "HH:MM" times only, each once, earliest first, at most MAX_REMINDER_TIMES. */
export function normaliseTimes(times: readonly string[]): string[] {
  return [...new Set(times.filter((t) => TIME.test(t)))].sort().slice(0, MAX_REMINDER_TIMES);
}

/**
 * Every reminder for the next `horizonDays` calendar days, today included:
 * each time on each allowed weekday (0 = Sunday), strictly after `now`,
 * earliest first. Today's carry the due count, and are left out when today
 * is done or nothing is due; later days carry the generic body, since
 * today's count says nothing about them. Scheduling a week ahead keeps the
 * reminders coming when the app is not opened for a few days.
 */
export function nextReminders(
  now: number,
  times: readonly string[],
  days: readonly number[],
  dueToday: number,
  doneToday: boolean,
  horizonDays = 7,
): Reminder[] {
  const allowed = new Set(days);
  const hasWork = !doneToday && dueToday > 0;
  const list: Reminder[] = [];
  for (let offset = 0; offset < horizonDays; offset += 1) {
    for (const time of normaliseTimes(times)) {
      const [, h, m] = TIME.exec(time)!;
      const at = occurrence(now, offset, Number(h), Number(m));
      if (at <= now || !allowed.has(new Date(at).getDay())) continue;
      if (offset === 0 && !hasWork) continue;
      list.push({ at, body: offset === 0 ? dueBody(dueToday) : GENERIC_BODY });
    }
  }
  return list;
}
