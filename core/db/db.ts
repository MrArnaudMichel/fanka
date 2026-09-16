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

export class FankaDatabase extends Dexie {
  decks!: Table<Deck, string>;
  cards!: Table<Card, string>;
  items!: Table<Item, string>;
  reviews!: Table<Review, string>;
  strokes!: Table<StrokeRow, string>;
  settings!: Table<SettingsRow, string>;
  outbox!: Table<OutboxEntry, string>;

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
  }
}

export const db = new FankaDatabase();
