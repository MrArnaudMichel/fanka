import { type Attempt, type Card, type Deck, type Item, type Review, type StudyMode, DIRECTION_MODE } from '~core/db/schema';
import { lessonOf } from '~core/lessons';
import type { StatsWindow } from './time';

export interface StatsFilter {
  window: StatsWindow;
  deckId: string | null;
  /** The decks tagged with this lesson; `deckId`, when also set, narrows further. */
  lesson: string | null;
  mode: StudyMode | null;
}

/** Every row the Statistics page reads, as it stood when the page opened. */
export interface StatsSnapshot {
  attempts: Attempt[];
  reviews: Review[];
  items: Item[];
  cards: Card[];
  decks: Deck[];
}

export interface FilteredSnapshot {
  /** Answers in the deck (as it was at the time) and mode. Not windowed. */
  attempts: Attempt[];
  /** Reviews of items in the deck (as it is now) and mode. Not windowed. */
  reviews: Review[];
  /** Live, unsuspended items in the deck and mode — what the schedule holds today. */
  items: Item[];
  /** Every item, card and deck, deleted ones included, so history still resolves. */
  itemsById: Map<string, Item>;
  cardsById: Map<string, Card>;
  decksById: Map<string, Deck>;
}

/**
 * Narrows a snapshot to a deck or a lesson, and a mode. The window is left to
 * each aggregate: streaks and the year calendar look past it.
 */
export function applyFilter(
  snapshot: StatsSnapshot,
  filter: Pick<StatsFilter, 'deckId' | 'mode'> & Partial<Pick<StatsFilter, 'lesson'>>,
): FilteredSnapshot {
  const decksById = new Map(snapshot.decks.map((d) => [d.id, d]));
  const cardsById = new Map(snapshot.cards.map((c) => [c.id, c]));
  const itemsById = new Map(snapshot.items.map((i) => [i.id, i]));
  const lesson = filter.lesson ?? null;
  const deckOk = (deckId: string | undefined) => {
    if (filter.deckId !== null && deckId !== filter.deckId) return false;
    if (lesson === null) return true;
    const deck = deckId === undefined ? undefined : decksById.get(deckId);
    return deck !== undefined && lessonOf(deck) === lesson;
  };
  const modeOk = (item: Item) => filter.mode === null || DIRECTION_MODE[item.dir] === filter.mode;
  const live = (card: Card | undefined) => card !== undefined && card.deletedAt === null && decksById.get(card.deckId)?.deletedAt === null;

  const items = snapshot.items.filter((i) => {
    const card = cardsById.get(i.cardId);
    return !i.suspended && live(card) && deckOk(card!.deckId) && modeOk(i);
  });
  const reviews = snapshot.reviews.filter((r) => {
    const item = itemsById.get(r.itemId);
    return item !== undefined && modeOk(item) && deckOk(cardsById.get(item.cardId)?.deckId);
  });
  const attempts = snapshot.attempts.filter((a) => deckOk(a.deckId) && (filter.mode === null || a.mode === filter.mode));

  return { attempts, reviews, items, itemsById, cardsById, decksById };
}
