import type { Attempt } from '~core/db/schema';
import { type StatsWindow, addDays, dayKey, findBucket, inWindow, startOfDayLocal, timeBuckets } from './time';

/** One answer counts for at most a minute of study time: a card left on screen over a break is not study. */
export const MAX_ANSWER_MS = 60_000;

const CALENDAR_DAYS = 53 * 7;

export interface ActivitySummary {
  currentStreak: number;
  bestStreak: number;
  daysStudied: number;
  answers: number;
  totalMs: number;
  averageMs: number;
  perStudyDay: number;
  calendar: { date: string; count: number; weekday: number }[];
  time: { key: string; scheduledMs: number; practiceMs: number }[];
  byHour: number[];
  byMode: { review: number; writing: number };
}

const capped = (a: Attempt) => Math.min(a.durationMs, MAX_ANSWER_MS);

/** `days` maps each studied day's key to its local midnight. */
function streaks(days: Map<string, number>, now: number): { current: number; best: number } {
  const today = startOfDayLocal(now);
  let current = 0;
  // Today may still be empty without breaking a streak earned before it.
  let cursor = days.has(dayKey(today)) ? today : addDays(today, -1);
  while (days.has(dayKey(cursor))) {
    current += 1;
    cursor = addDays(cursor, -1);
  }

  let best = 0;
  let run = 0;
  let previous: number | null = null;
  for (const day of [...days.values()].sort((a, b) => a - b)) {
    run = previous !== null && dayKey(addDays(previous, 1)) === dayKey(day) ? run + 1 : 1;
    best = Math.max(best, run);
    previous = day;
  }
  return { current, best };
}

export function activitySummary(attempts: readonly Attempt[], window: StatsWindow, now: number): ActivitySummary {
  const allDays = new Map<string, number>();
  for (const a of attempts) {
    const day = startOfDayLocal(a.at);
    allDays.set(dayKey(day), day);
  }
  const { current, best } = streaks(allDays, now);

  const windowed = attempts.filter((a) => inWindow(a.at, window, now));
  const totalMs = windowed.reduce((sum, a) => sum + capped(a), 0);
  const studyDays = new Set(windowed.map((a) => dayKey(a.at))).size;

  const perDay = new Map<string, number>();
  for (const a of attempts) perDay.set(dayKey(a.at), (perDay.get(dayKey(a.at)) ?? 0) + 1);
  const firstDay = addDays(startOfDayLocal(now), -(CALENDAR_DAYS - 1));
  const calendar = Array.from({ length: CALENDAR_DAYS }, (_, i) => {
    const day = addDays(firstDay, i);
    return { date: dayKey(day), count: perDay.get(dayKey(day)) ?? 0, weekday: (new Date(day).getDay() + 6) % 7 };
  });

  const earliest = attempts.reduce<number | null>((min, a) => (min === null || a.at < min ? a.at : min), null);
  const buckets = timeBuckets(window, now, earliest);
  const time = buckets.map((b) => ({ key: b.key, scheduledMs: 0, practiceMs: 0 }));
  const byHour = Array.from({ length: 24 }, () => 0);
  const byMode = { review: 0, writing: 0 };
  for (const a of windowed) {
    const i = findBucket(buckets, a.at);
    if (i !== -1) time[i]![a.source === 'practice' ? 'practiceMs' : 'scheduledMs'] += capped(a);
    byHour[new Date(a.at).getHours()]! += 1;
    byMode[a.mode] += 1;
  }

  return {
    currentStreak: current,
    bestStreak: best,
    daysStudied: studyDays,
    answers: windowed.length,
    totalMs,
    averageMs: windowed.length ? totalMs / windowed.length : 0,
    perStudyDay: studyDays ? windowed.length / studyDays : 0,
    calendar,
    time,
    byHour,
    byMode,
  };
}
