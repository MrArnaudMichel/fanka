import { db } from './db';
import { type Card, type Deck, type Direction, type Item, type OutboxEntry, type Review, itemId } from './schema';
import { type Grade, type SrsState, newSrsState } from '~core/srs';

function uid(): string {
  return crypto.randomUUID();
}

function outboxEntry(entity: OutboxEntry['entity'], entityId: string, op: OutboxEntry['op'], at: number): OutboxEntry {
  return { id: uid(), entity, entityId, op, at };
}

/** Indexes bulkGet results by id, dropping the gaps for keys that missed. */
function byId<T extends { id: string }>(rows: (T | undefined)[]): Map<string, T> {
  const map = new Map<string, T>();
  for (const row of rows) {
    if (row) map.set(row.id, row);
  }
  return map;
}

/** An item is visible only while both its card and that card's deck are live. */
function cardVisible(card: Card | undefined, decksById: Map<string, Deck>): boolean {
  if (!card || card.deletedAt !== null) return false;
  const deck = decksById.get(card.deckId);
  return deck !== undefined && deck.deletedAt === null;
}

/** decksById for the distinct decks referenced by the given cards. */
async function decksByIdFor(cardsById: Map<string, Card>): Promise<Map<string, Deck>> {
  const deckIds = [...new Set([...cardsById.values()].map((c) => c.deckId))];
  return byId(await db.decks.bulkGet(deckIds));
}

export const decks = {
  get: (id: string) => db.decks.get(id),

  async put(deck: Deck): Promise<void> {
    // The outbox entry is written inside the same transaction as the change,
    // so a crash between the two is not possible and no mutation is lost.
    await db.transaction('rw', db.decks, db.outbox, async () => {
      await db.decks.put(deck);
      await db.outbox.put(outboxEntry('deck', deck.id, 'put', deck.updatedAt));
    });
  },

  async listAll(): Promise<Deck[]> {
    const all = await db.decks.toArray();
    return all.filter((d) => d.deletedAt === null).sort((a, b) => a.name.localeCompare(b.name));
  },
};

export const cards = {
  get: (id: string) => db.cards.get(id),

  async create(card: Card, directions: Direction[], now: number): Promise<void> {
    await db.transaction('rw', db.cards, db.items, db.outbox, async () => {
      await db.cards.put(card);
      await db.outbox.put(outboxEntry('card', card.id, 'put', now));
      for (const dir of directions) {
        const item: Item = {
          ...newSrsState(now),
          id: itemId(card.id, dir),
          cardId: card.id,
          dir,
          suspended: false,
          updatedAt: now,
        };
        await db.items.put(item);
        await db.outbox.put(outboxEntry('item', item.id, 'put', now));
      }
    });
  },

  async forDeck(deckId: string): Promise<Card[]> {
    const all = await db.cards.where('deckId').equals(deckId).toArray();
    return all.filter((c) => c.deletedAt === null);
  },
};

export const items = {
  get: (id: string) => db.items.get(id),

  async put(item: Item): Promise<void> {
    await db.transaction('rw', db.items, db.outbox, async () => {
      await db.items.put(item);
      await db.outbox.put(outboxEntry('item', item.id, 'put', item.updatedAt));
    });
  },

  forCard: (cardId: string) => db.items.where('cardId').equals(cardId).toArray(),

  /**
   * Due, already introduced, not suspended, and belonging to a card and deck
   * that are both still live — soonest first. A soft-deleted card or deck
   * must never surface a review, so this always re-checks both, not just
   * `suspended`.
   */
  async due(now: number): Promise<Item[]> {
    const candidates = (await db.items.where('due').belowOrEqual(now).toArray()).filter(
      (i) => !i.suspended && i.state !== 'new',
    );
    const cardsById = byId(await db.cards.bulkGet(candidates.map((i) => i.cardId)));
    const decksById = await decksByIdFor(cardsById);
    return candidates
      .filter((i) => cardVisible(cardsById.get(i.cardId), decksById))
      .sort((a, b) => a.due - b.due);
  },

  /**
   * Never-seen items, oldest card first, so a deck is learned in its order.
   * Excludes items whose card or deck is soft-deleted, same as `due()`.
   */
  async fresh(limit: number): Promise<Item[]> {
    const candidates = (await db.items.where('state').equals('new').toArray()).filter((i) => !i.suspended);
    const cardsById = byId(await db.cards.bulkGet(candidates.map((i) => i.cardId)));
    const decksById = await decksByIdFor(cardsById);
    return candidates
      .filter((i) => cardVisible(cardsById.get(i.cardId), decksById))
      .sort((a, b) => (cardsById.get(a.cardId)?.createdAt ?? 0) - (cardsById.get(b.cardId)?.createdAt ?? 0))
      .slice(0, limit);
  },
};

export interface RecordedReview {
  item: Item;
  before: SrsState;
  grade: Grade;
  reviewedAt: number;
  durationMs: number;
}

export const reviews = {
  async record({ item, before, grade, reviewedAt, durationMs }: RecordedReview): Promise<string> {
    const reviewId = uid();
    await db.transaction('rw', db.items, db.reviews, db.outbox, async () => {
      // The caller's `before` is typed as `SrsState`, which has no
      // `updatedAt`, and a caller may legally pass a bare SrsState (not a
      // previously-fetched Item) — so it is never a trustworthy source for
      // the item's real prior `updatedAt`. The item's row, read here before
      // this write touches it, is the true previous state and is what gets
      // persisted. If the row is somehow absent (the item was deleted
      // concurrently), fall back to the incoming `item.updatedAt`.
      const priorItem = await db.items.get(item.id);
      const review: Review = {
        id: reviewId,
        itemId: item.id,
        grade,
        reviewedAt,
        durationMs,
        before: { ...before, updatedAt: priorItem?.updatedAt ?? item.updatedAt },
      };
      await db.items.put({ ...item, updatedAt: reviewedAt });
      await db.reviews.put(review);
      await db.outbox.put(outboxEntry('item', item.id, 'put', reviewedAt));
      await db.outbox.put(outboxEntry('review', reviewId, 'put', reviewedAt));
    });
    return reviewId;
  },

  /**
   * Undo is exact: the previous scheduling state, including the item's real
   * prior `updatedAt`, was captured in the review row by `record()`, so
   * restoring it is a copy rather than a recalculation or a heuristic.
   */
  async undo(reviewId: string): Promise<void> {
    await db.transaction('rw', db.items, db.reviews, db.outbox, async () => {
      const review = await db.reviews.get(reviewId);
      if (!review) return;
      const item = await db.items.get(review.itemId);
      if (item) {
        await db.items.put({ ...item, ...review.before });
        await db.outbox.put(outboxEntry('item', item.id, 'put', Date.now()));
      }
      await db.reviews.delete(reviewId);
      await db.outbox.put(outboxEntry('review', reviewId, 'delete', Date.now()));
    });
  },

  forItem: (itemIdValue: string) => db.reviews.where('itemId').equals(itemIdValue).sortBy('reviewedAt'),
};
