import 'fake-indexeddb/auto';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { useBackup } from '~/composables/useBackup';
import { db } from '~core/db/db';

const sync = vi.hoisted(() => ({ syncNow: async () => {}, refreshDetails: async () => {}, details: { value: { pending: 0 } } }));
vi.mock('~/composables/useSync', () => ({ useSync: () => sync }));

const reload = vi.fn();

beforeEach(async () => {
  await db.delete();
  await db.open();
  reload.mockClear();
  vi.stubGlobal('location', { reload });
  vi.stubGlobal('window', { location: { reload } });
});

describe('useBackup reset', () => {
  it('refuses while signed in and changes are still waiting to sync', async () => {
    sync.details.value.pending = 3;
    await db.outbox.add({ table: 'decks', op: 'put', id: 'x', updatedAt: 1 } as never);
    expect(await useBackup().reset(true)).toBe(3);
    expect(await db.outbox.count()).toBe(1);
    expect(reload).not.toHaveBeenCalled();
  });

  it('resets once everything has synced', async () => {
    sync.details.value.pending = 0;
    expect(await useBackup().reset(true)).toBe(0);
    expect(reload).toHaveBeenCalled();
  });

  it('resets signed out without syncing', async () => {
    sync.details.value.pending = 5;
    expect(await useBackup().reset(false)).toBe(0);
    expect(reload).toHaveBeenCalled();
  });
});
