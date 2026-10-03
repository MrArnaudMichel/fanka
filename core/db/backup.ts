import { type Backup, type BackupData, mergePlan } from '~core/backup/format';
import { db } from './db';
import type { OutboxEntry } from './schema';

export interface RestoreResult {
  decks: number;
  cards: number;
  items: number;
  reviews: number;
  attempts: number;
}

/** Every row, soft-deleted ones too, so a restore cannot bring a deleted card back. */
export async function readBackupData(): Promise<BackupData> {
  const [decks, cards, items, reviews, attempts] = await Promise.all([
    db.decks.toArray(),
    db.cards.toArray(),
    db.items.toArray(),
    db.reviews.toArray(),
    db.attempts.toArray(),
  ]);
  return { decks, cards, items, reviews, attempts };
}

function queued(entity: OutboxEntry['entity'], ids: string[], at: number): OutboxEntry[] {
  return ids.map((entityId) => ({ id: crypto.randomUUID(), entity, entityId, op: 'put', at }));
}

/** Merges `backup` in one transaction; every row written is queued for sync. Settings are replaced. */
export async function applyBackup(backup: Backup, now: number): Promise<RestoreResult> {
  return db.transaction('rw', [db.decks, db.cards, db.items, db.reviews, db.attempts, db.outbox, db.settings], async () => {
    const plan = mergePlan(await readBackupData(), backup);
    await db.decks.bulkPut(plan.decks);
    await db.cards.bulkPut(plan.cards);
    await db.items.bulkPut(plan.items);
    await db.reviews.bulkPut(plan.reviews);
    await db.attempts.bulkPut(plan.attempts);
    await db.outbox.bulkPut([
      ...queued('deck', plan.decks.map((r) => r.id), now),
      ...queued('card', plan.cards.map((r) => r.id), now),
      ...queued('item', plan.items.map((r) => r.id), now),
      ...queued('review', plan.reviews.map((r) => r.id), now),
      ...queued('attempt', plan.attempts.map((r) => r.id), now),
    ]);
    await db.settings.put({ key: 'settings', value: backup.settings });
    return {
      decks: plan.decks.length,
      cards: plan.cards.length,
      items: plan.items.length,
      reviews: plan.reviews.length,
      attempts: plan.attempts.length,
    };
  });
}

/**
 * Empties this device: collection, history, outbox, sync cursor and
 * settings. The stroke cache stays (it is only a download cache) and so does
 * the seed marker, so the starter deck is not added again.
 */
export async function resetDevice(): Promise<void> {
  const tables = [db.decks, db.cards, db.items, db.reviews, db.attempts, db.outbox, db.syncState, db.settings, db.importMappings];
  await db.transaction('rw', tables, async () => {
    const seed = await db.settings.get('seedVersion');
    await Promise.all(tables.map((table) => table.clear()));
    if (seed) await db.settings.put(seed);
  });
}
