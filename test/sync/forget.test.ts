import 'fake-indexeddb/auto';
import { beforeEach, describe, expect, it } from 'vitest';
import { db } from '~core/db/db';
import { forgetSyncedAccount, runSync } from '~core/sync/engine';
import type { RemoteChanges, SyncTransport } from '~core/sync/types';

beforeEach(async () => {
  await db.delete();
  await db.open();
});

describe('forgetSyncedAccount', () => {
  it('drops the pull cursor and every unsent change, and keeps local data', async () => {
    await db.syncState.put({ key: 'lastPulledAt', value: 123 });
    await db.outbox.put({ id: 'o1', entity: 'card', entityId: 'c1', op: 'put', at: 1 });
    await db.decks.put({ id: 'd1', deletedAt: null } as never);

    await forgetSyncedAccount();

    expect(await db.syncState.get('lastPulledAt')).toBeUndefined();
    expect(await db.outbox.count()).toBe(0);
    expect(await db.decks.count()).toBe(1);
  });

  it('waits for a sync already in flight, so its pull cannot write the cursor back', async () => {
    let resolvePull!: (remote: RemoteChanges) => void;
    const transport: SyncTransport = {
      pull: () => new Promise((resolve) => (resolvePull = resolve)),
      push: async () => ({ at: 0 }),
    };
    const sync = runSync(transport);
    await new Promise((r) => setTimeout(r, 0));

    const forgotten = forgetSyncedAccount();
    resolvePull({ decks: [], cards: [], items: [], reviews: [], attempts: [], lessonProgress: [], at: 999 });
    await Promise.all([sync, forgotten]);

    expect(await db.syncState.get('lastPulledAt')).toBeUndefined();
  });
});
