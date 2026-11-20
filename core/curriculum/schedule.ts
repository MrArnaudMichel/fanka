import { newSrsState } from '../srs/scheduler';
import type { Scheduler, SchedulerSettings, SrsState } from '../srs/types';
import type { Word } from './types';

const DAY_START_HOUR = 4;

/** The next 04:00 in local time, strictly after `now`. */
function nextDayStart(now: number): number {
  const at = new Date(now);
  at.setHours(DAY_START_HOUR, 0, 0, 0);
  if (at.getTime() <= now) at.setDate(at.getDate() + 1);
  return at.getTime();
}

/**
 * The first schedule of a word met in a lesson: the scheduler applied to a
 * new state, Good if every answer was right, Again otherwise. A right word is
 * not due again before the next day starts.
 */
export function seedState(
  scheduler: Scheduler,
  settings: SchedulerSettings,
  right: boolean,
  now: number,
): SrsState {
  const next = scheduler.apply(newSrsState(now), right ? 3 : 1, now, settings);
  if (!right) return next;
  return { ...next, due: Math.max(next.due, nextDayStart(now)) };
}

const HAN = /\p{Script=Han}/u;

/** The distinct Han characters of each word that have stroke data, in word order. */
export function writingCharacters(
  words: Word[],
  hasStrokes: (ch: string) => boolean,
): { wordId: string; chars: string[] }[] {
  const out: { wordId: string; chars: string[] }[] = [];
  for (const word of words) {
    const chars = [...new Set([...word.hanzi].filter((ch) => HAN.test(ch) && hasStrokes(ch)))];
    if (chars.length > 0) out.push({ wordId: word.id, chars });
  }
  return out;
}
