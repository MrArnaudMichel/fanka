/**
 * Endless practice: which card to show next, outside the schedule. Pure — the
 * session that calls it keeps the weights and the recent history in memory
 * and never writes a grade back.
 *
 * Every card starts at weight 1. A miss triples it (up to `MAX_WEIGHT`), so a
 * card just failed comes back several times more often than the rest; a hit
 * divides it by three, back towards 1.
 */

export const MAX_WEIGHT = 9;

/** How many of the latest cards are held back from the next draw. */
export const RECENT_WINDOW = 3;

export function weightAfter(weight: number, correct: boolean): number {
  return correct ? Math.max(1, weight / 3) : Math.min(MAX_WEIGHT, weight * 3);
}

/**
 * A weighted random pick from `ids`, skipping the last `RECENT_WINDOW` of
 * `recent` (most recent last). The window shrinks to leave at least one card,
 * so a pool of one or two still has something to show. A missing weight
 * counts as 1.
 */
export function pickNext(
  ids: readonly string[],
  weights: ReadonlyMap<string, number>,
  recent: readonly string[],
  random: () => number = Math.random,
): string | null {
  if (ids.length === 0) return null;
  const window = Math.min(RECENT_WINDOW, ids.length - 1);
  const held = new Set(window > 0 ? recent.slice(-window) : []);
  let candidates = ids.filter((id) => !held.has(id));
  if (candidates.length === 0) candidates = [...ids];

  const weightOf = (id: string) => weights.get(id) ?? 1;
  const total = candidates.reduce((sum, id) => sum + weightOf(id), 0);
  let target = random() * total;
  for (const id of candidates) {
    target -= weightOf(id);
    if (target < 0) return id;
  }
  return candidates[candidates.length - 1]!;
}
