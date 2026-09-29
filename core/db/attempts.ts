import type { Grade } from '~core/srs';
import { type Attempt, type AttemptDetail, type AttemptSource, type Card, type Item, type Review, DIRECTION_MODE, SELF_GRADED } from './schema';

export interface AttemptInput {
  id: string;
  item: Pick<Item, 'id' | 'cardId' | 'dir'>;
  deckId: string;
  source: AttemptSource;
  grade: Grade;
  at: number;
  durationMs: number;
  detail: AttemptDetail;
}

export function buildAttempt({ id, item, deckId, source, grade, at, durationMs, detail }: AttemptInput): Attempt {
  return {
    id,
    itemId: item.id,
    cardId: item.cardId,
    deckId,
    mode: DIRECTION_MODE[item.dir],
    source,
    grade,
    correct: grade > 1,
    at,
    durationMs,
    checked: detail.checked,
    writing: detail.writing,
  };
}

/**
 * The attempt a review written before attempts existed stands for. `null`
 * when its item or card is gone — there is no deck or mode to give it.
 */
export function attemptFromReview(review: Review, item: Item | undefined, card: Card | undefined): Attempt | null {
  if (!item || !card) return null;
  return buildAttempt({
    id: review.id,
    item,
    deckId: card.deckId,
    source: 'scheduled',
    grade: review.grade,
    at: review.reviewedAt,
    durationMs: review.durationMs,
    detail: SELF_GRADED,
  });
}
