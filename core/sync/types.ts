import type { Attempt, Card, Deck, Item, LessonProgress, Review } from '~core/db/schema';

/**
 * The entity kinds the outbox — and therefore sync — tracks. `OutboxEntry`
 * has no `'settings'` variant, so `Settings` is not synced yet; see the
 * report for why.
 */
export type SyncEntity = 'deck' | 'card' | 'item' | 'review' | 'attempt' | 'lessonProgress';

export interface RemoteChanges {
  decks: Deck[];
  cards: Card[];
  items: Item[];
  reviews: Review[];
  attempts: Attempt[];
  lessonProgress: LessonProgress[];
  /**
   * The transport's own clock at the moment of this pull — not necessarily
   * the max `updatedAt` among the returned rows, so a row committed between
   * the query and the response is not silently skipped by the next `since`.
   * Becomes the next call's `since`.
   */
  at: number;
}

export interface LocalChanges {
  decks: Deck[];
  cards: Card[];
  items: Item[];
  reviews: Review[];
  attempts: Attempt[];
  lessonProgress: LessonProgress[];
}

/**
 * What `core/sync` needs from a backend. Nothing in `core/sync` imports
 * Supabase, or anything else network-shaped, directly except
 * `core/sync/supabase.ts` — the one file allowed to implement this.
 */
export interface SyncTransport {
  /** Every row touched (created, edited or soft-deleted) since `since` (epoch ms), across all six entities. */
  pull(since: number): Promise<RemoteChanges>;
  /**
   * Upserts the given rows for `decks`/`cards`/`items`/`lessonProgress`; inserts
   * `reviews` and `attempts` (insert-only — the transport must not attempt
   * to update an existing review or attempt row).
   */
  push(changes: LocalChanges): Promise<{ at: number }>;
}

export interface EntityCounts {
  decks: number;
  cards: number;
  items: number;
  reviews: number;
  attempts: number;
  lessonProgress: number;
}

export interface SyncResult {
  /** Rows actually sent to `transport.push` this run (0s, and no call at all, when the outbox was empty). */
  pushed: EntityCounts;
  /** Rows from the pull that actually replaced or added a local row (a remote echo of a row already at least as new locally counts as 0). */
  pulled: EntityCounts;
}
