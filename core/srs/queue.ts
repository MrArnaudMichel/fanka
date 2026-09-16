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
 * These two rules can conflict: a card due in one direction and still new
 * in the other is the ordinary state of a partially-learned card, and
 * nothing stops both from landing in the same session. When fixing a
 * same-card adjacency forces a choice, adjacency always wins — a run of new
 * material is a worse session than the alternative, but two directions of
 * one card back to back turns the second answer into a memory test of the
 * previous screen rather than of the word. See `separateDirections` for how
 * that priority is enforced and where the new-item spread bound becomes
 * best-effort rather than guaranteed.
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
 *
 * Adjacency is unconditional: every conflict found gets fixed, regardless
 * of what that does to the new-item spread. Where there is a *choice* of
 * forward swap partner, though, this prefers the nearest one that keeps the
 * queue's longest new-item run within `spread()`'s bound
 * (`ceil(new / (review + 1))`), falling back to the nearest valid partner
 * when none of them do. That preference is best-effort, not a guarantee:
 * `due` and `fresh` normally share no cardId, so this code path rarely
 * even runs, but when a card is due in one direction and still new in the
 * other, resolving the resulting adjacency conflicts can force two new
 * items together in a way no available swap avoids — adjacency still wins
 * when that happens.
 */
function separateDirections(queue: Item[]): Item[] {
  const out = [...queue];
  const bound = newItemRunBound(out);
  for (let i = 1; i < out.length; i += 1) {
    if (out[i]!.cardId !== out[i - 1]!.cardId) continue;
    const swapWith = bestSwapPartner(out, i, bound);
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

/** The bound `spread()` guarantees on its own output, recomputed from the
 * item counts actually in `queue` (state `'new'` vs. everything else) so it
 * stays correct through `separateDirections`' swaps, which reorder items
 * but never change how many of each kind there are. */
function newItemRunBound(queue: Item[]): number {
  const newCount = queue.filter((candidate) => candidate.state === 'new').length;
  const reviewCount = queue.length - newCount;
  return Math.ceil(newCount / (reviewCount + 1));
}

/**
 * Among the indices `j > i` whose cardId differs from `out[i - 1]`'s (valid
 * swap partners for the conflict at `i`), returns the nearest one that would
 * keep the queue's longest new-item run within `bound` after the swap, or
 * the nearest valid partner at all if none of them do. Returns -1 if there
 * is no valid partner, in which case the caller falls back to the backward
 * swap described above.
 */
function bestSwapPartner(out: Item[], i: number, bound: number): number {
  const conflictingCardId = out[i - 1]!.cardId;
  let nearestValid = -1;
  for (let j = i + 1; j < out.length; j += 1) {
    if (out[j]!.cardId === conflictingCardId) continue;
    if (nearestValid === -1) nearestValid = j;
    if (maxNewRunAfterSwap(out, i, j) <= bound) return j;
  }
  return nearestValid;
}

/** The longest run of `state === 'new'` items the queue would have if
 * positions `i` and `j` were swapped. Simulated on a scratch copy rather
 * than reasoned about from neighbours alone, since a swap can touch two
 * non-adjacent runs at once — simplicity here matters more than the
 * constant-factor cost, and session queues are small. */
function maxNewRunAfterSwap(out: Item[], i: number, j: number): number {
  const scratch = [...out];
  [scratch[i], scratch[j]] = [scratch[j]!, scratch[i]!];
  let run = 0;
  let max = 0;
  for (const candidate of scratch) {
    run = candidate.state === 'new' ? run + 1 : 0;
    max = Math.max(max, run);
  }
  return max;
}
