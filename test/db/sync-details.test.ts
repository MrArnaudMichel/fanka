import 'fake-indexeddb/auto';
import { beforeEach, describe, expect, it } from 'vitest';
import { db } from '~core/db/db';
import { readSyncDetails } from '~core/db/sync-details';

beforeEach(async () => {
  await db.delete();
  await db.open();
});

describe('readSyncDetails', () => {
  it('counts live decks and cards, every review and the outbox', async () => {
    await db.decks.bulkPut([
      { id: 'd1', deletedAt: null } as never,
      { id: 'd2', deletedAt: 5 } as never,
    ]);
    await db.cards.bulkPut([{ id: 'c1', deckId: 'd1', deletedAt: null } as never]);
    await db.reviews.bulkPut([{ id: 'r1', itemId: 'i', reviewedAt: 1 } as never, { id: 'r2', itemId: 'i', reviewedAt: 2 } as never]);
    await db.outbox.put({ id: 'o1', entity: 'card', entityId: 'c1', op: 'put', at: 1 });

    expect(await readSyncDetails()).toEqual({ pending: 1, decks: 1, cards: 1, reviews: 2 });
  });
});
