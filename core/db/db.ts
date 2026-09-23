import Dexie, { type Table } from 'dexie';

import type { Card, Deck, Item, OutboxEntry, Review } from './schema';

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

export class FankaDatabase extends Dexie {
  decks!: Table<Deck, string>;
  cards!: Table<Card, string>;
  items!: Table<Item, string>;
  reviews!: Table<Review, string>;
  strokes!: Table<StrokeRow, string>;
  settings!: Table<SettingsRow, string>;
  outbox!: Table<OutboxEntry, string>;
  syncState!: Table<SyncStateRow, string>;

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
  }
}

export const db = new FankaDatabase();
