import { db } from './db';

export interface SyncDetails {
  /** Changes written locally and not yet sent. */
  pending: number;
  decks: number;
  cards: number;
  reviews: number;
}

/** What Account's sync block shows. Soft-deleted decks and cards are not counted. */
export async function readSyncDetails(): Promise<SyncDetails> {
  const [pending, decks, cards, reviews] = await Promise.all([
    db.outbox.count(),
    db.decks.filter((d) => d.deletedAt === null).count(),
    db.cards.filter((c) => c.deletedAt === null).count(),
    db.reviews.count(),
  ]);
  return { pending, decks, cards, reviews };
}
