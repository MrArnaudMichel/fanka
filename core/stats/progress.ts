import type { Attempt, Card, Item, Review } from '~core/db/schema';
import type { SrsState } from '~core/srs';
import { MAX_ANSWER_MS } from './activity';
import { MATURE_DAYS } from './memory';
import { type StatsWindow, addDays, inWindow, startOfDayLocal, timeBuckets } from './time';

/** Known-word counts worth celebrating, in order. */
export const MILESTONES = [10, 25, 50, 100, 250, 500, 1000, 2000, 5000] as const;

const HAN = /\p{Script=Han}/u;

/** A word is known once its recognition item is in review with a mature interval. */
function isKnown(state: Pick<SrsState, 'state' | 'scheduledDays'>): boolean {
  return state.state === 'review' && state.scheduledDays >= MATURE_DAYS;
}

/** Each recognition item with its reviews, oldest first. */
function historyByItem(items: readonly Item[], reviews: readonly Review[]): { item: Item; reviews: Review[] }[] {
  const recognition = items.filter((i) => i.dir === 'recognition');
  const byItem = new Map<string, Review[]>(recognition.map((i) => [i.id, []]));
  for (const r of reviews) byItem.get(r.itemId)?.push(r);
  return recognition.map((item) => ({ item, reviews: byItem.get(item.id)!.sort((a, b) => a.reviewedAt - b.reviewedAt) }));
}

/**
 * Whether an item was known just before `at`: its state after the last
 * review before then — the next review's `before`, or the item as it is now
 * after its last review. An item with no review at all (synced or imported
 * before reviews were kept) is read as it is now from its last review on.
 */
function knownBefore(item: Item, reviews: readonly Review[], at: number): boolean {
  if (reviews.length === 0) return (item.lastReview ?? 0) < at && isKnown(item);
  let last = -1;
  while (last + 1 < reviews.length && reviews[last + 1]!.reviewedAt < at) last += 1;
  if (last === -1) return false;
  const after = last + 1 < reviews.length ? reviews[last + 1]!.before : item;
  return isKnown(after);
}

/** How many words were known just before `at`. */
export function knownCountAt(items: readonly Item[], reviews: readonly Review[], at: number): number {
  return historyByItem(items, reviews).filter((h) => knownBefore(h.item, h.reviews, at)).length;
}

export interface KnownTimeline {
  /** Words known now. */
  known: number;
  /** Distinct characters across the known words. */
  characters: number;
  /** Words known at the end of each bucket of the window. */
  series: { key: string; known: number }[];
}

export function knownTimeline(
  items: readonly Item[],
  reviews: readonly Review[],
  cardsById: ReadonlyMap<string, Card>,
  window: StatsWindow,
  now: number,
): KnownTimeline {
  const history = historyByItem(items, reviews);
  const knownNow = history.filter((h) => isKnown(h.item));
  const characters = new Set<string>();
  for (const { item } of knownNow) {
    for (const ch of cardsById.get(item.cardId)?.hanzi ?? '') if (HAN.test(ch)) characters.add(ch);
  }

  const earliest = reviews.length === 0 ? null : Math.min(...reviews.map((r) => r.reviewedAt));
  const series = timeBuckets(window, now, earliest).map((b) => ({
    key: b.key,
    known: history.filter((h) => knownBefore(h.item, h.reviews, b.end)).length,
  }));
  return { known: knownNow.length, characters: characters.size, series };
}

/** The last milestone reached and the next one; null past either end. */
export function milestoneProgress(known: number): { reached: number | null; next: number | null } {
  const reached = [...MILESTONES].reverse().find((m) => m <= known) ?? null;
  const next = MILESTONES.find((m) => m > known) ?? null;
  return { reached, next };
}

export interface WeekTotals {
  answers: number;
  /** Time answering, each answer capped like Activity's. */
  ms: number;
  days: number;
}

function totals(attempts: readonly Attempt[], start: number, end: number): WeekTotals {
  const inRange = attempts.filter((a) => a.at >= start && a.at < end);
  return {
    answers: inRange.length,
    ms: inRange.reduce((sum, a) => sum + Math.min(a.durationMs, MAX_ANSWER_MS), 0),
    days: new Set(inRange.map((a) => startOfDayLocal(a.at))).size,
  };
}

/** The last seven days, today included, and the seven before them. */
export function weekSummary(attempts: readonly Attempt[], now: number): { thisWeek: WeekTotals; lastWeek: WeekTotals } {
  const today = startOfDayLocal(now);
  const weekStart = addDays(today, -6);
  return {
    thisWeek: totals(attempts, weekStart, addDays(today, 1)),
    lastWeek: totals(attempts, addDays(weekStart, -7), weekStart),
  };
}

export interface WeakWord {
  cardId: string;
  hanzi: string;
  translation: string;
  wrong: number;
  total: number;
}

/**
 * The live cards missed most in the window, from every answer — scheduled
 * and practice alike. Ties go to the higher failure rate, then the most
 * recent miss.
 */
export function weakWords(
  attempts: readonly Attempt[],
  cardsById: ReadonlyMap<string, Card>,
  window: StatsWindow,
  now: number,
  limit = 5,
): WeakWord[] {
  const byCard = new Map<string, { wrong: number; total: number; lastMiss: number }>();
  for (const a of attempts) {
    if (!inWindow(a.at, window, now)) continue;
    const entry = byCard.get(a.cardId) ?? { wrong: 0, total: 0, lastMiss: 0 };
    entry.total += 1;
    if (!a.correct) {
      entry.wrong += 1;
      entry.lastMiss = Math.max(entry.lastMiss, a.at);
    }
    byCard.set(a.cardId, entry);
  }
  return [...byCard]
    .filter(([cardId, e]) => e.wrong > 0 && cardsById.get(cardId)?.deletedAt === null)
    .sort(([, a], [, b]) => b.wrong - a.wrong || b.wrong / b.total - a.wrong / a.total || b.lastMiss - a.lastMiss)
    .slice(0, limit)
    .map(([cardId, e]) => {
      const card = cardsById.get(cardId)!;
      return { cardId, hanzi: card.hanzi, translation: card.translation, wrong: e.wrong, total: e.total };
    });
}
