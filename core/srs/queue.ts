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
 * Places `introducing` items across `reviewing` so they land at
 * proportionally even gaps through the whole sequence, decided up front from
 * the total counts rather than incrementally.
 *
 * An incremental "insert every N reviews" scheme (advancing a running
 * threshold as review items are consumed) looks equivalent but is not: once
 * `reviewing` runs out, any new items not yet placed have nowhere principled
 * left to go and end up dumped in a clump at the end — precisely the
 * front-loading problem this function exists to avoid, just moved to the
 * back. A case as ordinary as one review item and five new ones reproduces
 * it: every new item ends up after the lone review item, in a solid run.
 * Computing each new item's target position from the full counts up front
 * avoids that: it also cleanly degrades to "no reviews" (all new items
 * placed back to back, nothing else to spread them across — unavoidable)
 * and to "no new items" (reviews untouched).
 */
function spread(reviewing: Item[], introducing: Item[]): Item[] {
  const merged: Item[] = [];
  let reviewIndex = 0;
  const gaps = introducing.length + 1;

  for (let n = 0; n < introducing.length; n += 1) {
    const targetReviewCount = Math.round((reviewing.length / gaps) * (n + 1));
    while (reviewIndex < targetReviewCount && reviewIndex < reviewing.length) {
      merged.push(reviewing[reviewIndex]!);
      reviewIndex += 1;
    }
    merged.push(introducing[n]!);
  }
  while (reviewIndex < reviewing.length) {
    merged.push(reviewing[reviewIndex]!);
    reviewIndex += 1;
  }

  return merged;
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
