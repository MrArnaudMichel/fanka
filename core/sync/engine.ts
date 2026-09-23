import type { Table } from 'dexie';

import { db } from '~core/db/db';
import type { Card, Deck, Item, OutboxEntry, Review } from '~core/db/schema';
import type { EntityCounts, LocalChanges, RemoteChanges, SyncResult, SyncTransport } from './types';

const LAST_PULLED_AT_KEY = 'lastPulledAt';

async function getLastPulledAt(): Promise<number> {
  const row = await db.syncState.get(LAST_PULLED_AT_KEY);
  return typeof row?.value === 'number' ? row.value : 0;
}

/**
 * Whole-row last-write-wins: the incoming row replaces the local one only
 * when it is at least as new. A tie goes to the remote row, which is what
 * makes re-pulling a row nothing has touched since a no-op rather than a
 * pointless rewrite — and, since a soft delete is just an ordinary field
 * change stamped with a newer `updatedAt`, this is also exactly what makes a
 * remote delete beat an older local edit: no special case needed, the
 * timestamp already decides it.
 */
async function mergeRow<T extends { id: string; updatedAt: number }>(table: Table<T, string>, remote: T): Promise<boolean> {
  const local = await table.get(remote.id);
  if (local && local.updatedAt > remote.updatedAt) return false;
  await table.put(remote);
  return true;
}

/**
 * Reviews are append-only and merged by id: a review this device has never
 * seen is inserted; one it already has is left untouched (record() never
 * updates a review row, so there is nothing to reconcile).
 */
async function applyRemote(remote: RemoteChanges): Promise<EntityCounts> {
  const counts: EntityCounts = { decks: 0, cards: 0, items: 0, reviews: 0 };
  await db.transaction('rw', db.decks, db.cards, db.items, db.reviews, db.syncState, async () => {
    for (const row of remote.decks) if (await mergeRow(db.decks, row)) counts.decks += 1;
    for (const row of remote.cards) if (await mergeRow(db.cards, row)) counts.cards += 1;
    for (const row of remote.items) if (await mergeRow(db.items, row)) counts.items += 1;
    for (const row of remote.reviews) {
      const existing = await db.reviews.get(row.id);
      if (!existing) {
        await db.reviews.put(row);
        counts.reviews += 1;
      }
    }
    await db.syncState.put({ key: LAST_PULLED_AT_KEY, value: remote.at });
  });
  return counts;
}

interface OutboxGroups {
  deckIds: Set<string>;
  cardIds: Set<string>;
  itemIds: Set<string>;
  reviewIds: Set<string>;
}

function groupOutbox(entries: OutboxEntry[]): OutboxGroups {
  const groups: OutboxGroups = { deckIds: new Set(), cardIds: new Set(), itemIds: new Set(), reviewIds: new Set() };
  for (const entry of entries) {
    if (entry.entity === 'deck') groups.deckIds.add(entry.entityId);
    else if (entry.entity === 'card') groups.cardIds.add(entry.entityId);
    else if (entry.entity === 'item') groups.itemIds.add(entry.entityId);
    else groups.reviewIds.add(entry.entityId);
  }
  return groups;
}

/**
 * Builds the push payload from the *current* rows, not from the outbox
 * entries themselves — several outbox entries for the same id collapse into
 * the one row that exists now, so a row edited three times since the last
 * sync is still sent once.
 *
 * An id with no current row has nothing left to push. The only way that
 * happens today is a review's `undo`, which hard-deletes the review row and
 * records a `'delete'` outbox entry for it — but reviews are insert-only on
 * the server (see the migration), so there was never a way to propagate
 * that delete anyway. See the hazard note on `reviews.undo` in
 * `core/db/repositories.ts`. Its outbox entry is still cleared by the
 * caller once the push succeeds, since nothing further can be done with it.
 */
async function buildPayload(groups: OutboxGroups): Promise<LocalChanges> {
  const [decks, cards, items, reviews] = await Promise.all([
    db.decks.bulkGet([...groups.deckIds]),
    db.cards.bulkGet([...groups.cardIds]),
    db.items.bulkGet([...groups.itemIds]),
    db.reviews.bulkGet([...groups.reviewIds]),
  ]);
  return {
    decks: decks.filter((row): row is Deck => Boolean(row)),
    cards: cards.filter((row): row is Card => Boolean(row)),
    items: items.filter((row): row is Item => Boolean(row)),
    reviews: reviews.filter((row): row is Review => Boolean(row)),
  };
}

const EMPTY_COUNTS: EntityCounts = { decks: 0, cards: 0, items: 0, reviews: 0 };

/**
 * Pulls remote changes since the last cursor, merges them in, then pushes
 * whatever the outbox still holds and clears exactly those entries.
 *
 * Order matters for correctness but not for conflict resolution: pull is
 * applied first so a genuinely newer remote edit lands before this device
 * builds its push payload from "current rows" — if the remote row won,
 * that's what gets sent back, which is a harmless no-op echo rather than a
 * lost local edit, since last-write-wins is decided per row by `updatedAt`
 * regardless of pull/push order.
 *
 * If `transport.push` throws, the outbox is left completely untouched —
 * the clearing transaction never runs — so a retry resends exactly the same
 * rows. A crash or throw during `applyRemote` is atomic per Dexie's
 * transaction (all of it lands, or none of it does), so the cursor is never
 * left ahead of what was actually merged.
 */
export async function runSync(transport: SyncTransport): Promise<SyncResult> {
  const since = await getLastPulledAt();
  const remote = await transport.pull(since);
  const pulled = await applyRemote(remote);

  const entries = await db.outbox.toArray();
  if (entries.length === 0) {
    return { pushed: EMPTY_COUNTS, pulled };
  }

  const groups = groupOutbox(entries);
  const payload = await buildPayload(groups);
  await transport.push(payload);

  await db.outbox.bulkDelete(entries.map((entry) => entry.id));

  return {
    pushed: { decks: payload.decks.length, cards: payload.cards.length, items: payload.items.length, reviews: payload.reviews.length },
    pulled,
  };
}
