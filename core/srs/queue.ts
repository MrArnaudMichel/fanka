import type { Item } from '~core/db/schema';

export interface QueueInput {
  due: Item[];
  fresh: Item[];
  newPerDay: number;
  introducedToday: number;
}

/**
 * Two rules shape the order, and both are about the learner rather than the
 * algorithm:
 *
 * New cards are spread through the session instead of stacked at the front,
 * because a wall of unknown characters is where people quit.
 *
 * The two directions of one card are never adjacent, because answering
 * "學習 → to study" and then immediately "to study → 學習" tests recall of the
 * previous screen, not of the word.
 *
 * `due` and `fresh` are trusted as already filtered: `items.due()` excludes
 * suspended items, items whose card/deck is soft-deleted, and anything not
 * yet due; `items.fresh()` excludes suspended and soft-deleted items and
 * only ever returns `state === 'new'`. `buildQueue` re-checking any of that
 * would be redundant with the repository layer, so it does not.
 */
export function buildQueue({ due, fresh, newPerDay, introducedToday }: QueueInput): Item[] {
  const allowance = Math.max(0, newPerDay - introducedToday);
  const introducing = fresh.slice(0, allowance);
  const reviewing = due;

  return separateDirections(spread(reviewing, introducing));
}

/**
 * Distributes `introducing` items as evenly as possible across the
 * `reviewing.length + 1` gaps around the review items (before the first,
 * between each consecutive pair, and after the last), so that gap sizes
 * differ by at most one. That is a hard guarantee, not an aspiration: the
 * longest run of consecutive new items in the result is at most
 * `ceil(introducing.length / (reviewing.length + 1))`, because every run of
 * new items lives entirely inside one gap — review items are what separate
 * gaps — so the longest run is exactly the size of the largest gap, and no
 * gap can exceed the ceiling of the even split.
 *
 * An earlier version computed each new item's insertion point incrementally
 * from a running threshold advanced as review items were consumed. That
 * looks equivalent but is not: it has no such bound. E.g. 2 review items and
 * 10 new ones produced a run of 6 consecutive new items — worse than the
 * bound of `ceil(10 / 3) = 4` this version guarantees — because once the
 * threshold overshot the remaining review supply, every new item still
 * waiting got placed back to back with nothing between them. Computing the
 * whole distribution up front, rather than one threshold at a time, is what
 * makes the bound provable: each gap's size is fixed before any item is
 * placed, independent of how the previous gaps happened to round.
 */
function spread(reviewing: Item[], introducing: Item[]): Item[] {
  const gapSizes = distributeEvenly(introducing.length, reviewing.length + 1);
  const merged: Item[] = [];
  let newIndex = 0;

  for (let gap = 0; gap < gapSizes.length; gap += 1) {
    for (let k = 0; k < gapSizes[gap]!; k += 1) {
      merged.push(introducing[newIndex]!);
      newIndex += 1;
    }
    if (gap < reviewing.length) merged.push(reviewing[gap]!);
  }

  return merged;
}

/**
 * Splits `total` into `bins` non-negative integers that sum to `total` and
 * differ from one another by at most one — the standard "as evenly as
 * possible" integer split. Each bin's size is `floor(total / bins)` or
 * `ceil(total / bins)`; which bins get the larger share is an implementation
 * detail, but the bound on every bin's size is not.
 */
function distributeEvenly(total: number, bins: number): number[] {
  const sizes: number[] = [];
  let assigned = 0;
  for (let bin = 0; bin < bins; bin += 1) {
    const cumulative = Math.floor(((bin + 1) * total) / bins);
    sizes.push(cumulative - assigned);
    assigned = cumulative;
  }
  return sizes;
}

/**
 * A single forward pass is not enough on its own. Given the data model — a
 * card contributes at most two items, one per direction — a conflict at
 * index `i` (out[i] sharing a cardId with out[i - 1]) can always be fixed by
 * swapping forward, *except* when `i` is the queue's last index: since that
 * card's only two occurrences are already both accounted for (at `i - 1`
 * and `i`), every later item is guaranteed to belong to a different card, so
 * a forward-only search always succeeds — unless there is no later item to
 * find. In that one case, the fallback swaps the *earlier* of the two
 * conflicting items with its own predecessor instead; that predecessor
 * cannot be the same card either, by the same argument, so the swap cannot
 * introduce a new conflict. This relies on the two-items-per-card
 * invariant; it is not a general "no two adjacent equal" solver. The one
 * case nothing can fix is a queue of exactly two items that are both the
 * same card — there is nothing else to place between them.
 */
function separateDirections(queue: Item[]): Item[] {
  const out = [...queue];
  for (let i = 1; i < out.length; i += 1) {
    if (out[i]!.cardId !== out[i - 1]!.cardId) continue;
    const swapWith = out.findIndex((candidate, j) => j > i && candidate.cardId !== out[i - 1]!.cardId);
    if (swapWith > i) {
      [out[i], out[swapWith]] = [out[swapWith]!, out[i]!];
      continue;
    }
    if (i >= 2 && out[i - 2]!.cardId !== out[i]!.cardId) {
      [out[i - 2], out[i - 1]] = [out[i - 1]!, out[i - 2]!];
    }
  }
  return out;
}
