import 'fake-indexeddb/auto';
import { beforeEach, describe, expect, it } from 'vitest';
import { db } from '~core/db/db';
import { decks } from '~core/db/repositories';
import type { Deck } from '~core/db/schema';
import { runSync } from '~core/sync/engine';
import type { LocalChanges, RemoteChanges, SyncTransport } from '~core/sync/types';

const NOW = Date.parse('2026-09-16T08:00:00Z');

/**
 * A minimal stand-in for the real Supabase transport, just enough to prove
 * a push actually happens — see `test/sync/engine.test.ts`'s `FakeTransport`
 * for the fuller version this borrows the shape of.
 */
class FakeTransport implements SyncTransport {
  decks = new Map<string, Deck>();
  pushCalls: LocalChanges[] = [];

  async pull(since: number): Promise<RemoteChanges> {
    return { decks: [], cards: [], items: [], reviews: [], attempts: [], lessonProgress: [], at: since };
  }

  async push(changes: LocalChanges): Promise<{ at: number }> {
    this.pushCalls.push(changes);
    for (const d of changes.decks) this.decks.set(d.id, d);
    return { at: NOW };
  }
}

beforeEach(async () => {
  await db.delete();
  await db.open();
});

/**
 * `core/db/repositories.ts` writes an outbox row inside the same transaction
 * as every deck/card/item/review change, with no idea whether anyone is
 * signed in — there is no `userId` anywhere in the local schema at all (see
 * `core/db/schema.ts`). That is exactly what makes "use the app offline,
 * then sign in later" safe: a row written before there was ever a
 * `SyncTransport` to push it to sits in the outbox no differently than one
 * written a second after sign-in, and the very next `runSync` call — the
 * one `app/plugins/sync.client.ts` fires the moment `useAuth()`'s `user`
 * goes from signed-out to signed-in — pushes it.
 */
describe('a write made while signed out', () => {
  it('stays in the outbox and is pushed on the first sync after sign-in', async () => {
    const deck: Deck = {
      id: 'offline-deck',
      name: 'Made offline',
      description: '',
      colorToken: 'var(--chart-series-1)',
      tag: '',
      bundle: 'taiwan' as const, translationLang: 'en',
      createdAt: NOW,
      updatedAt: NOW,
      deletedAt: null,
    };
    await decks.put(deck);

    // Proof it is queued, not silently dropped, before any transport exists.
    const pending = await db.outbox.toArray();
    expect(pending).toHaveLength(1);
    expect(pending[0]).toMatchObject({ entity: 'deck', entityId: 'offline-deck', op: 'put' });

    // "Signing in" is simply: a transport now exists, and runSync is called
    // with it — exactly what app/plugins/sync.client.ts's sign-in watcher does.
    const transport = new FakeTransport();
    const result = await runSync(transport);

    expect(result.pushed.decks).toBe(1);
    expect(transport.decks.get('offline-deck')).toMatchObject({ name: 'Made offline' });
    expect(await db.outbox.count()).toBe(0);
  });
});
