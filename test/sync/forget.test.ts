import 'fake-indexeddb/auto';
import { beforeEach, describe, expect, it } from 'vitest';
import { db } from '~core/db/db';
import { forgetSyncedAccount } from '~core/sync/engine';

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
});
