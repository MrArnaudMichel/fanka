import 'fake-indexeddb/auto';
import { beforeEach, describe, expect, it } from 'vitest';
import { buildBackup } from '~core/backup/format';
import { applyBackup, readBackupData, resetDevice } from '~core/db/backup';
import { db } from '~core/db/db';
import { DEFAULT_SETTINGS, loadSettings } from '~core/db/settings';

const deck = (id: string, updatedAt: number) => ({ id, name: id, updatedAt, deletedAt: null }) as never;

beforeEach(async () => {
  await db.delete();
  await db.open();
});

describe('backup I/O', () => {
  it('reads every table, soft-deleted rows included', async () => {
    await db.decks.bulkPut([deck('d1', 1), { ...(deck('d2', 1) as object), deletedAt: 9 } as never]);
    expect((await readBackupData()).decks.map((d) => d.id).sort()).toEqual(['d1', 'd2']);
  });

  it('applies only newer rows, queues each for sync and replaces settings', async () => {
    await db.decks.put(deck('d1', 10));
    const backup = buildBackup(
      { decks: [deck('d1', 5), deck('d2', 3)], cards: [], items: [], reviews: [], attempts: [] },
      { ...DEFAULT_SETTINGS, newPerDay: 33 },
      100,
    );
    const result = await applyBackup(backup, 200);
    expect(result.decks).toBe(1);
    expect((await db.decks.get('d1'))?.updatedAt).toBe(10);
    expect(await db.decks.get('d2')).toBeDefined();
    expect((await db.outbox.toArray()).map((o) => `${o.entity}:${o.entityId}`)).toEqual(['deck:d2']);
    expect((await loadSettings()).newPerDay).toBe(33);
  });

  it('resets the device but keeps the seed marker so nothing reseeds', async () => {
    await db.decks.put(deck('d1', 1));
    await db.outbox.put({ id: 'o', entity: 'deck', entityId: 'd1', op: 'put', at: 1 });
    await db.syncState.put({ key: 'lastPulledAt', value: 5 });
    await db.settings.put({ key: 'seedVersion', value: 3 });
    await db.settings.put({ key: 'settings', value: { newPerDay: 1 } });
    await resetDevice();
    expect(await db.decks.count()).toBe(0);
    expect(await db.outbox.count()).toBe(0);
    expect(await db.syncState.count()).toBe(0);
    expect((await db.settings.get('seedVersion'))?.value).toBe(3);
    expect(await db.settings.get('settings')).toBeUndefined();
  });
});
