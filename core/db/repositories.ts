import { db } from './db';
import { type Card, type Deck, type Direction, type Item, type OutboxEntry, type Review, itemId } from './schema';
import { type Grade, type SrsState, newSrsState } from '~core/srs';

function uid(): string {
  return crypto.randomUUID();
}

function outboxEntry(entity: OutboxEntry['entity'], entityId: string, op: OutboxEntry['op'], at: number): OutboxEntry {
  return { id: uid(), entity, entityId, op, at };
}

/**
 * `Review.before` is typed as `SrsState`, which has no `updatedAt`, but a
 * caller that snapshots a real `Item` before mutating it (the documented,
 * exact-undo usage) still carries that field on the object at runtime. This
 * reads it back without widening the public type or resorting to `any`.
 */
function capturedUpdatedAt(before: SrsState): number | undefined {
  const withUpdatedAt = before as SrsState & { updatedAt?: unknown };
  return typeof withUpdatedAt.updatedAt === 'number' ? withUpdatedAt.updatedAt : undefined;
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

  /** Due, already introduced, not suspended — soonest first. */
  async due(now: number): Promise<Item[]> {
    const candidates = await db.items.where('due').belowOrEqual(now).toArray();
    return candidates
      .filter((i) => !i.suspended && i.state !== 'new')
      .sort((a, b) => a.due - b.due);
  },

  /** Never-seen items, oldest card first, so a deck is learned in its order. */
  async fresh(limit: number): Promise<Item[]> {
    const fresh = (await db.items.where('state').equals('new').toArray()).filter((i) => !i.suspended);
    const byCard = new Map((await db.cards.bulkGet(fresh.map((i) => i.cardId))).filter(Boolean).map((c) => [c!.id, c!]));
    return fresh
      .sort((a, b) => (byCard.get(a.cardId)?.createdAt ?? 0) - (byCard.get(b.cardId)?.createdAt ?? 0))
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
    const review: Review = { id: uid(), itemId: item.id, grade, reviewedAt, durationMs, before };
    await db.transaction('rw', db.items, db.reviews, db.outbox, async () => {
      await db.items.put({ ...item, updatedAt: reviewedAt });
      await db.reviews.put(review);
      await db.outbox.put(outboxEntry('item', item.id, 'put', reviewedAt));
      await db.outbox.put(outboxEntry('review', review.id, 'put', reviewedAt));
    });
    return review.id;
  },

  /**
   * Undo is exact: the previous scheduling state was captured in the review
   * row, so restoring it is a copy rather than a recalculation.
   *
   * `before` is typed as `SrsState`, but every real caller derives it from a
   * previously-fetched `Item` (as `reviews.record` requires), which still
   * carries its original `updatedAt` at runtime even though the type doesn't
   * say so. Preferring that value over the `lastReview` fallback is what
   * makes the restore exact rather than merely equal-by-coincidence: a bare
   * `lastReview ?? item.updatedAt` heuristic restores the wrong `updatedAt`
   * whenever a review's `reviewedAt` differs from the item's `updatedAt` at
   * the time it was last touched and the item had never been reviewed
   * before (`lastReview === null`).
   */
  async undo(reviewId: string): Promise<void> {
    await db.transaction('rw', db.items, db.reviews, db.outbox, async () => {
      const review = await db.reviews.get(reviewId);
      if (!review) return;
      const item = await db.items.get(review.itemId);
      if (item) {
        const restoredUpdatedAt = capturedUpdatedAt(review.before) ?? review.before.lastReview ?? item.updatedAt;
        await db.items.put({ ...item, ...review.before, updatedAt: restoredUpdatedAt });
        await db.outbox.put(outboxEntry('item', item.id, 'put', Date.now()));
      }
      await db.reviews.delete(reviewId);
      await db.outbox.put(outboxEntry('review', reviewId, 'delete', Date.now()));
    });
  },

  forItem: (itemIdValue: string) => db.reviews.where('itemId').equals(itemIdValue).sortBy('reviewedAt'),
};
