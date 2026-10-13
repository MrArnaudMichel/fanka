import type { FilteredSnapshot } from './filter';
import { MATURE_DAYS, type Ratio } from './memory';
import { type StatsWindow, inWindow } from './time';

export interface DeckRow {
  deckId: string;
  name: string;
  /** Live cards. */
  words: number;
  /** Words whose recognition item is in review with a mature interval. */
  known: number;
  /** Words whose recognition item is learning or relearning. */
  learning: number;
  /** Words whose recognition item was never answered. */
  new: number;
  /** Mature answers right in the window. */
  retention: Ratio;
  /** Words practised at least once in the window. */
  practised: number;
  /** Practice answers right in the window. */
  practice: Ratio;
}

/**
 * Every live deck side by side, from a snapshot filtered on neither deck nor
 * mode. Word states come from recognition items: a word is known when it is
 * recalled from its hanzi.
 */
export function deckComparison(data: FilteredSnapshot, window: StatsWindow, now: number): DeckRow[] {
  const rows = new Map<string, DeckRow>();
  for (const deck of data.decksById.values()) {
    if (deck.deletedAt !== null) continue;
    rows.set(deck.id, {
      deckId: deck.id,
      name: deck.name,
      words: 0,
      known: 0,
      learning: 0,
      new: 0,
      retention: { right: 0, total: 0 },
      practised: 0,
      practice: { right: 0, total: 0 },
    });
  }

  for (const card of data.cardsById.values()) {
    if (card.deletedAt === null) {
      const row = rows.get(card.deckId);
      if (row) row.words += 1;
    }
  }

  for (const item of data.items) {
    if (item.dir !== 'recognition') continue;
    const row = rows.get(data.cardsById.get(item.cardId)?.deckId ?? '');
    if (!row) continue;
    if (item.state === 'new') row.new += 1;
    else if (item.state === 'learning' || item.state === 'relearning') row.learning += 1;
    else if (item.scheduledDays >= MATURE_DAYS) row.known += 1;
  }

  for (const review of data.reviews) {
    if (!inWindow(review.reviewedAt, window, now)) continue;
    if (review.before.state !== 'review' || review.before.scheduledDays < MATURE_DAYS) continue;
    const item = data.itemsById.get(review.itemId);
    const row = rows.get(data.cardsById.get(item?.cardId ?? '')?.deckId ?? '');
    if (!row) continue;
    row.retention.total += 1;
    if (review.grade > 1) row.retention.right += 1;
  }

  const practisedCards = new Map<string, Set<string>>();
  for (const a of data.attempts) {
    if (a.source !== 'practice' || !inWindow(a.at, window, now)) continue;
    const row = rows.get(a.deckId);
    if (!row) continue;
    row.practice.total += 1;
    if (a.correct) row.practice.right += 1;
    const cards = practisedCards.get(a.deckId) ?? new Set<string>();
    cards.add(a.cardId);
    practisedCards.set(a.deckId, cards);
  }
  for (const [deckId, cards] of practisedCards) rows.get(deckId)!.practised = cards.size;

  return [...rows.values()].sort((a, b) => a.name.localeCompare(b.name));
}
