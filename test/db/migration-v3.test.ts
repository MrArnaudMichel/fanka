import 'fake-indexeddb/auto';
import Dexie from 'dexie';
import { describe, expect, it } from 'vitest';
import { db } from '~core/db/db';

const NOW = Date.parse('2026-09-16T08:00:00Z');
const before = { state: 'new', due: NOW, stability: 0, difficulty: 0, elapsedDays: 0, scheduledDays: 0, reps: 0, lapses: 0, learningSteps: 0, lastReview: null, updatedAt: NOW };

describe('Dexie version 3', () => {
  it('backfills one attempt per review, under the review id, and queues them for sync', async () => {
    db.close();
    await Dexie.delete('fanka');
    const legacy = new Dexie('fanka');
    legacy.version(2).stores({
      decks: 'id, updatedAt, deletedAt',
      cards: 'id, deckId, updatedAt, deletedAt, *tags',
      items: 'id, cardId, dir, due, state, suspended, updatedAt',
      reviews: 'id, itemId, reviewedAt',
      strokes: 'char',
      settings: 'key',
      outbox: 'id, entity, entityId, at',
      syncState: 'key',
    });
    await legacy.open();
    await legacy.table('cards').put({ id: 'c1', deckId: 'd1' });
    await legacy.table('items').put({ id: 'c1:production', cardId: 'c1', dir: 'production' });
    await legacy.table('reviews').bulkPut([
      { id: 'r1', itemId: 'c1:production', grade: 3, reviewedAt: NOW, durationMs: 5000, before },
      { id: 'orphan', itemId: 'gone:recognition', grade: 1, reviewedAt: NOW, durationMs: 1, before },
    ]);
    legacy.close();

    await db.open();

    expect(await db.attempts.toArray()).toEqual([
      { id: 'r1', itemId: 'c1:production', cardId: 'c1', deckId: 'd1', mode: 'writing', source: 'scheduled', grade: 3, correct: true, at: NOW, durationMs: 5000, checked: false, writing: null },
    ]);
    expect((await db.outbox.toArray()).map((e) => [e.entity, e.entityId, e.op])).toEqual([['attempt', 'r1', 'put']]);
  });
});
