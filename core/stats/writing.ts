import type { WritingError } from '~core/chinese/strokes';
import type { Attempt, Card, WritingResult } from '~core/db/schema';
import { type Ratio, rate } from './memory';
import { type StatsWindow, findBucket, inWindow, timeBuckets } from './time';

const MISSED_LIMIT = 30;

export interface MissedCharacter {
  character: string;
  attempts: number;
  shapeRate: number;
  /** Share in the right order among the right shapes; `null` when no shape was right. */
  orderRate: number | null;
  lastError: WritingError | null;
  lastAt: number;
  /** Last time it was drawn with the right shape in the right order; null if never in the window. */
  lastRightAt: number | null;
}

export interface WritingSummary {
  character: Ratio;
  order: Ratio;
  checked: Ratio;
  series: { key: string; character: number | null; order: number | null }[];
  errors: Record<WritingError, number>;
  missed: MissedCharacter[];
}

const add = (r: Ratio, right: boolean) => {
  r.total += 1;
  if (right) r.right += 1;
};

/**
 * Writing accuracy, per drawn character. The order is judged only where the
 * shape was right, so its ratio counts those characters alone.
 */
export function writingSummary(attempts: readonly Attempt[], window: StatsWindow, now: number): WritingSummary {
  const writing = attempts.filter((a) => a.mode === 'writing' && inWindow(a.at, window, now));
  const earliest = writing.reduce<number | null>((min, a) => (min === null || a.at < min ? a.at : min), null);
  const buckets = timeBuckets(window, now, earliest, 7);
  const perBucket = buckets.map(() => ({ character: { right: 0, total: 0 }, order: { right: 0, total: 0 } }));

  const character = { right: 0, total: 0 };
  const order = { right: 0, total: 0 };
  const checked = { right: 0, total: 0 };
  const errors: Record<WritingError, number> = { 'stroke-count': 0, 'stroke-shape': 0, 'stroke-order': 0, 'stroke-direction': 0 };
  const byCharacter = new Map<string, { results: { r: WritingResult; at: number }[] }>();

  for (const a of writing) {
    add(checked, a.checked);
    const i = findBucket(buckets, a.at);
    for (const r of a.writing ?? []) {
      add(character, r.shapeCorrect);
      if (r.shapeCorrect) add(order, r.orderCorrect);
      if (i !== -1) {
        add(perBucket[i]!.character, r.shapeCorrect);
        if (r.shapeCorrect) add(perBucket[i]!.order, r.orderCorrect);
      }
      if (r.error) errors[r.error] += 1;
      const entry = byCharacter.get(r.character) ?? { results: [] };
      entry.results.push({ r, at: a.at });
      byCharacter.set(r.character, entry);
    }
  }

  const missed: MissedCharacter[] = [];
  for (const [char, { results }] of byCharacter) {
    const faults = results.filter(({ r }) => r.error !== null);
    if (faults.length === 0) continue;
    const shapes = results.filter(({ r }) => r.shapeCorrect);
    const last = faults.reduce((x, y) => (y.at > x.at ? y : x));
    missed.push({
      character: char,
      attempts: results.length,
      shapeRate: shapes.length / results.length,
      orderRate: shapes.length ? shapes.filter(({ r }) => r.orderCorrect).length / shapes.length : null,
      lastError: last.r.error,
      lastAt: last.at,
      lastRightAt: results.filter(({ r }) => r.error === null).reduce<number | null>((x, { at }) => (x === null || at > x ? at : x), null),
    });
  }
  missed.sort((x, y) => x.shapeRate - y.shapeRate || (x.orderRate ?? 0) - (y.orderRate ?? 0) || y.lastAt - x.lastAt);

  return {
    character,
    order,
    checked,
    series: buckets.map((b, i) => ({ key: b.key, character: rate(perBucket[i]!.character), order: rate(perBucket[i]!.order) })),
    errors,
    missed: missed.slice(0, MISSED_LIMIT),
  };
}

/** For each character, the live cards whose hanzi hold it, in card order. */
export function cardsContaining(characters: readonly string[], cardsById: ReadonlyMap<string, Card>): Map<string, string[]> {
  const live = [...cardsById.values()].filter((c) => c.deletedAt === null);
  return new Map(characters.map((ch) => [ch, live.filter((c) => c.hanzi.includes(ch)).map((c) => c.id)]));
}
