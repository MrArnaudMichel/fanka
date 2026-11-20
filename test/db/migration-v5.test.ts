import 'fake-indexeddb/auto';
import Dexie from 'dexie';
import { describe, expect, it } from 'vitest';
import { db } from '~core/db/db';

describe('Dexie version 5', () => {
  it('gives every existing deck the Taiwan bundle', async () => {
    db.close();
    await Dexie.delete('fanka');
    const legacy = new Dexie('fanka');
    legacy.version(4).stores({
      decks: 'id, updatedAt, deletedAt',
      cards: 'id, deckId, updatedAt, deletedAt, *tags',
      items: 'id, cardId, dir, due, state, suspended, updatedAt',
      reviews: 'id, itemId, reviewedAt',
      strokes: 'char',
      settings: 'key',
      outbox: 'id, entity, entityId, at',
      syncState: 'key',
      attempts: 'id, at, itemId, cardId, deckId, mode, source',
      importMappings: 'signature',
    });
    await legacy.open();
    await legacy.table('decks').bulkPut([
      { id: 'd1', name: 'One', updatedAt: 1, deletedAt: null },
      { id: 'd2', name: 'Two', updatedAt: 1, deletedAt: 5 },
    ]);
    legacy.close();

    await db.open();

    expect((await db.decks.orderBy('id').toArray()).map((d) => d.bundle)).toEqual(['taiwan', 'taiwan']);
    expect(await db.outbox.count()).toBe(0);
  });
});
