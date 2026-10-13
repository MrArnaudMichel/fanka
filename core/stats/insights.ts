import type { Attempt, Item, Review } from '~core/db/schema';
import { activitySummary } from './activity';
import { MATURE_DAYS } from './memory';
import { knownCountAt, milestoneProgress } from './progress';
import { type StatsWindow, addDays, startOfDayLocal } from './time';

const MAX_INSIGHTS = 4;
/** Each month must hold this many mature answers before their retention is compared. */
const MIN_RETENTION_ANSWERS = 20;
/** Smaller moves, in percentage points, are noise. */
const MIN_RETENTION_MOVE = 3;
const MIN_CHARACTER_ATTEMPTS = 3;
const MIN_ANSWERS_FOR_HOUR = 30;

export interface Insight {
  icon: string;
  text: string;
}

export interface InsightInput {
  /** Filtered reviews, not windowed. */
  reviews: readonly Review[];
  /** Filtered attempts, not windowed. */
  attempts: readonly Attempt[];
  /** Filtered live items, every direction. */
  items: readonly Item[];
  /** Writing's most missed character, if any. */
  missedCharacter: { character: string; attempts: number } | null;
  window: StatsWindow;
  now: number;
}

const percent = (value: number) => Math.round(value * 100);

/** Share of mature answers right in [start, end), or null under the minimum. */
function matureRetention(reviews: readonly Review[], start: number, end: number): number | null {
  const mature = reviews.filter(
    (r) => r.reviewedAt >= start && r.reviewedAt < end && r.before.state === 'review' && r.before.scheduledDays >= MATURE_DAYS,
  );
  if (mature.length < MIN_RETENTION_ANSWERS) return null;
  return mature.filter((r) => r.grade > 1).length / mature.length;
}

function retentionInsight({ reviews, now }: InsightInput): Insight | null {
  const monthStart = addDays(now, -30);
  const recent = matureRetention(reviews, monthStart, now);
  const before = matureRetention(reviews, addDays(monthStart, -30), monthStart);
  if (recent === null || before === null) return null;
  const [from, to] = [percent(before), percent(recent)];
  if (Math.abs(to - from) < MIN_RETENTION_MOVE) return null;
  const rose = to > from;
  return { icon: rose ? 'trending-up' : 'trending-down', text: `Mature retention ${rose ? 'rose' : 'fell'} from ${from}% to ${to}% this month` };
}

function milestoneInsight({ items, reviews, now }: InsightInput): Insight | null {
  const known = knownCountAt(items, reviews, now + 1);
  const { reached } = milestoneProgress(known);
  const weekStart = addDays(startOfDayLocal(now), -6);
  if (reached === null || knownCountAt(items, reviews, weekStart) >= reached) return null;
  for (let day = weekStart; day <= now; day = addDays(day, 1)) {
    const end = Math.min(addDays(day, 1), now + 1);
    if (knownCountAt(items, reviews, end) >= reached) {
      const date = new Date(day).toLocaleDateString('en-GB', { day: 'numeric', month: 'short' });
      return { icon: 'trophy', text: `You reached ${reached} known words on ${date}` };
    }
  }
  return null;
}

function characterInsight({ missedCharacter }: InsightInput): Insight | null {
  if (!missedCharacter || missedCharacter.attempts < MIN_CHARACTER_ATTEMPTS) return null;
  return { icon: 'pen-line', text: `${missedCharacter.character} is the character you miss most` };
}

function hourInsight({ attempts, window, now }: InsightInput): Insight | null {
  const { answers, byHour } = activitySummary(attempts, window, now);
  if (answers < MIN_ANSWERS_FOR_HOUR) return null;
  const hour = byHour.indexOf(Math.max(...byHour));
  return { icon: 'clock', text: `You study most around ${String(hour).padStart(2, '0')}:00` };
}

function dueTomorrowInsight({ items, now }: InsightInput): Insight | null {
  const start = addDays(startOfDayLocal(now), 1);
  const end = addDays(start, 1);
  const due = items.filter((i) => i.state !== 'new' && !i.suspended && i.due >= start && i.due < end).length;
  if (due === 0) return null;
  return { icon: 'layers', text: `${due} ${due === 1 ? 'card is' : 'cards are'} due tomorrow` };
}

/** Up to four plain sentences about the learner's study, each only when it holds. */
export function insights(input: InsightInput): Insight[] {
  return [retentionInsight, milestoneInsight, characterInsight, hourInsight, dueTomorrowInsight]
    .map((rule) => rule(input))
    .filter((i): i is Insight => i !== null)
    .slice(0, MAX_INSIGHTS);
}
