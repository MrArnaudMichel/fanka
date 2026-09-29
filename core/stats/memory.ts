import { type Item, type StudyMode, DIRECTION_MODE } from '~core/db/schema';
import type { Grade } from '~core/srs';
import type { FilteredSnapshot } from './filter';
import { type StatsWindow, addDays, dayKey, findBucket, inWindow, startOfDayLocal, timeBuckets } from './time';

/** Above this interval a review item is mature — the threshold Browse and Today use. */
export const MATURE_DAYS = 21;

const FORECAST_DAYS = 30;
const HARDEST_LIMIT = 20;

export interface Ratio {
  right: number;
  total: number;
}

export function rate(r: Ratio): number | null {
  return r.total === 0 ? null : r.right / r.total;
}

export interface HardItem {
  itemId: string;
  cardId: string;
  hanzi: string;
  translation: string;
  mode: StudyMode;
  lapses: number;
  reviews: number;
  failures: number;
  failureRate: number;
}

export interface MemorySummary {
  retention: { young: Ratio; mature: Ratio };
  retentionSeries: { key: string; young: number | null; mature: number | null }[];
  forecast: { date: string; count: number }[];
  intervals: { label: string; count: number }[];
  cardStates: { new: number; learning: number; young: number; mature: number };
  answerMix: { again: number; hard: number; good: number; easy: number };
  hardest: HardItem[];
}

const GRADE_KEY: Record<Grade, keyof MemorySummary['answerMix']> = { 1: 'again', 2: 'hard', 3: 'good', 4: 'easy' };

const INTERVALS: { label: string; max: number }[] = [
  { label: '1 d', max: 1 },
  { label: '2–3 d', max: 3 },
  { label: '4–7 d', max: 7 },
  { label: '8–14 d', max: 14 },
  { label: '15–30 d', max: 30 },
  { label: '1–3 mo', max: 90 },
  { label: 'Over 3 mo', max: Infinity },
];

/**
 * How well the schedule is holding. Retention is true retention: the share
 * of answers right on items that were already in review (not learning), read
 * from the state each review captured before it was answered.
 */
export function memorySummary(
  f: Pick<FilteredSnapshot, 'reviews' | 'items' | 'itemsById' | 'cardsById'>,
  window: StatsWindow,
  now: number,
): MemorySummary {
  const windowed = f.reviews.filter((r) => inWindow(r.reviewedAt, window, now));
  const earliest = windowed.reduce<number | null>((min, r) => (min === null || r.reviewedAt < min ? r.reviewedAt : min), null);
  const buckets = timeBuckets(window, now, earliest, 7);
  const perBucket = buckets.map(() => ({ young: { right: 0, total: 0 }, mature: { right: 0, total: 0 } }));

  const retention = { young: { right: 0, total: 0 }, mature: { right: 0, total: 0 } };
  const answerMix = { again: 0, hard: 0, good: 0, easy: 0 };
  for (const r of windowed) {
    answerMix[GRADE_KEY[r.grade]] += 1;
    if (r.before.state !== 'review') continue;
    const age = r.before.scheduledDays > MATURE_DAYS ? 'mature' : 'young';
    const right = r.grade > 1 ? 1 : 0;
    retention[age].total += 1;
    retention[age].right += right;
    const i = findBucket(buckets, r.reviewedAt);
    if (i !== -1) {
      perBucket[i]![age].total += 1;
      perBucket[i]![age].right += right;
    }
  }
  const retentionSeries = buckets.map((b, i) => ({ key: b.key, young: rate(perBucket[i]!.young), mature: rate(perBucket[i]!.mature) }));

  const today = startOfDayLocal(now);
  const forecast = Array.from({ length: FORECAST_DAYS }, (_, i) => ({ date: dayKey(addDays(today, i)), count: 0 }));
  const forecastEnds = forecast.map((_, i) => addDays(today, i + 1));
  const intervals = INTERVALS.map(({ label }) => ({ label, count: 0 }));
  const cardStates = { new: 0, learning: 0, young: 0, mature: 0 };
  for (const item of f.items) {
    if (item.state === 'new') cardStates.new += 1;
    else if (item.state === 'learning' || item.state === 'relearning') cardStates.learning += 1;
    else if (item.scheduledDays > MATURE_DAYS) cardStates.mature += 1;
    else cardStates.young += 1;

    if (item.state !== 'new') {
      const day = forecastEnds.findIndex((end) => item.due < end);
      if (day !== -1) forecast[day]!.count += 1;
    }
    if (item.state === 'review') intervals[INTERVALS.findIndex((b) => item.scheduledDays <= b.max)]!.count += 1;
  }

  return { retention, retentionSeries, forecast, intervals, cardStates, answerMix, hardest: hardest(f) };
}

function hardest(f: Pick<FilteredSnapshot, 'reviews' | 'items' | 'cardsById'>): HardItem[] {
  const tally = new Map<string, { reviews: number; failures: number }>();
  for (const r of f.reviews) {
    const t = tally.get(r.itemId) ?? { reviews: 0, failures: 0 };
    t.reviews += 1;
    if (r.grade === 1) t.failures += 1;
    tally.set(r.itemId, t);
  }
  const rows: HardItem[] = [];
  for (const item of f.items as Item[]) {
    const t = tally.get(item.id) ?? { reviews: 0, failures: 0 };
    if (item.lapses === 0 && t.failures === 0) continue;
    const card = f.cardsById.get(item.cardId);
    rows.push({
      itemId: item.id,
      cardId: item.cardId,
      hanzi: card?.hanzi ?? '—',
      translation: card?.translation ?? '',
      mode: DIRECTION_MODE[item.dir],
      lapses: item.lapses,
      reviews: t.reviews,
      failures: t.failures,
      failureRate: t.reviews ? t.failures / t.reviews : 0,
    });
  }
  return rows.sort((a, b) => b.lapses - a.lapses || b.failureRate - a.failureRate).slice(0, HARDEST_LIMIT);
}
