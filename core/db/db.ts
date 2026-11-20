import Dexie, { type Table } from 'dexie';

import { attemptFromReview } from './attempts';
import type { Target } from '~core/import/mapping';
import type { Attempt, Card, Deck, Item, OutboxEntry, Review } from './schema';

export interface SettingsRow {
  key: string;
  value: unknown;
}

export interface StrokeRow {
  char: string;
  data: unknown;
  fetchedAt: number;
}

/**
 * Small key/value store for `core/sync`'s own bookkeeping — today just the
 * `lastPulledAt` cursor. Kept separate from `SettingsRow`/`Settings` (which
 * is user-facing app config) so sync internals never risk colliding with a
 * setting key or getting wiped by a settings import/reset.
 */
export interface SyncStateRow {
  key: string;
  value: unknown;
}

/** A column mapping the learner confirmed, kept for the next file with the same header. Local only, never synced. */
export interface ImportMappingRow {
  signature: string;
  columns: Target[];
  updatedAt: number;
}

export class FankaDatabase extends Dexie {
  decks!: Table<Deck, string>;
  cards!: Table<Card, string>;
  items!: Table<Item, string>;
  reviews!: Table<Review, string>;
  attempts!: Table<Attempt, string>;
  strokes!: Table<StrokeRow, string>;
  settings!: Table<SettingsRow, string>;
  outbox!: Table<OutboxEntry, string>;
  syncState!: Table<SyncStateRow, string>;
  importMappings!: Table<ImportMappingRow, string>;

  constructor() {
    super('fanka');
    // items.due is indexed because the due query runs on every screen.
    // `suspended` is declared as an index below but IndexedDB keys may only
    // be number, string, Date, ArrayBuffer or Array — a boolean is not a
    // valid key, so records are silently omitted from that index rather than
    // rejected (verified empirically; see task-6-report.md). The repository
    // never queries the index — items.due() filters `suspended` in JS — so
    // this is harmless dead weight kept for schema readability.
    this.version(1).stores({
      decks: 'id, updatedAt, deletedAt',
      cards: 'id, deckId, updatedAt, deletedAt, *tags',
      items: 'id, cardId, dir, due, state, suspended, updatedAt',
      reviews: 'id, itemId, reviewedAt',
      strokes: 'char',
      settings: 'key',
      outbox: 'id, entity, entityId, at',
    });
    // Additive only: every store from version 1 is left unlisted here and
    // keeps its existing definition, per Dexie's incremental versioning.
    this.version(2).stores({
      syncState: 'key',
    });
    // Every answer, from any session. The upgrade gives each existing review
    // its attempt under the review's own id, so two devices that both
    // upgrade produce the same rows and sync never duplicates them.
    this.version(3)
      .stores({ attempts: 'id, at, itemId, cardId, deckId, mode, source' })
      .upgrade(async (tx) => {
        const itemsById = new Map((await tx.table<Item>('items').toArray()).map((i) => [i.id, i]));
        const cardsById = new Map((await tx.table<Card>('cards').toArray()).map((c) => [c.id, c]));
        const rows: Attempt[] = [];
        for (const review of await tx.table<Review>('reviews').toArray()) {
          const item = itemsById.get(review.itemId);
          const attempt = attemptFromReview(review, item, item ? cardsById.get(item.cardId) : undefined);
          if (attempt) rows.push(attempt);
        }
        await tx.table<Attempt>('attempts').bulkPut(rows);
        await tx.table<OutboxEntry>('outbox').bulkPut(
          rows.map((a) => ({ id: crypto.randomUUID(), entity: 'attempt' as const, entityId: a.id, op: 'put' as const, at: a.at })),
        );
      });
    // Additive: remembered import mappings, local to this device.
    this.version(4).stores({ importMappings: 'signature' });
    // Every deck belongs to a bundle; those made before bundles existed are Taiwan.
    // No outbox entries: the server column defaults to 'taiwan'.
    this.version(5)
      .stores({})
      .upgrade(async (tx) => {
        await tx
          .table<Deck>('decks')
          .toCollection()
          .modify((deck) => {
            deck.bundle ??= 'taiwan';
          });
      });
  }
}

export const db = new FankaDatabase();
