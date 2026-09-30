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

/**
 * The next daily reminder at local `time` ("HH:MM"). Today's occurrence is used
 * while it is still ahead and there is work left; otherwise the reminder is for
 * tomorrow, with a generic body since today's count says nothing about then.
 * Null when `time` is not a valid "HH:MM".
 */
export function nextReminder(now: number, time: string, dueToday: number, doneToday: boolean): Reminder | null {
  const match = TIME.exec(time);
  if (!match) return null;
  const hour = Number(match[1]);
  const minute = Number(match[2]);

  const today = occurrence(now, 0, hour, minute);
  const hasWork = !doneToday && dueToday > 0;
  if (hasWork && today > now) return { at: today, body: dueBody(dueToday) };
  return { at: occurrence(now, 1, hour, minute), body: GENERIC_BODY };
}
