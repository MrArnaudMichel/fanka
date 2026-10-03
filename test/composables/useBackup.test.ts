import 'fake-indexeddb/auto';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { useBackup } from '~/composables/useBackup';
import { db } from '~core/db/db';

const sync = vi.hoisted(() => ({ syncNow: vi.fn(async () => {}), refreshDetails: async () => {}, details: { value: null } }));
vi.mock('~/composables/useSync', () => ({ useSync: () => sync }));

const reload = vi.fn();
const queued = { id: 'o1', entity: 'deck', entityId: 'd1', op: 'put', at: 1 } as const;

beforeEach(async () => {
  await db.delete();
  await db.open();
  reload.mockClear();
  sync.syncNow.mockClear();
  vi.stubGlobal('location', { reload });
  vi.stubGlobal('window', { location: { reload } });
});

describe('useBackup reset', () => {
  it('syncs first, then refuses while the outbox still holds changes', async () => {
    await db.outbox.put(queued);
    expect(await useBackup().reset(true)).toBe(1);
    expect(sync.syncNow).toHaveBeenCalled();
    expect(await db.outbox.count()).toBe(1);
    expect(reload).not.toHaveBeenCalled();
  });

  it('reads the outbox itself, so a stale sync summary cannot let a reset through', async () => {
    // useSync's cached details are null here, as after a failed refresh.
    await db.outbox.put(queued);
    expect(await useBackup().reset(true)).toBe(1);
  });

  it('resets once everything has synced', async () => {
    expect(await useBackup().reset(true)).toBe(0);
    expect(reload).toHaveBeenCalled();
  });

  it('resets signed out without syncing', async () => {
    await db.outbox.put(queued);
    expect(await useBackup().reset(false)).toBe(0);
    expect(sync.syncNow).not.toHaveBeenCalled();
    expect(reload).toHaveBeenCalled();
  });
});
