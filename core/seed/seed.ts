import { db } from '~core/db/db';
import { decks } from '~core/db/repositories';
import type { Card } from '~core/db/schema';

/**
 * 1 seeded the 20-word starter deck. 2 retires it: nothing is seeded, and an
 * install that still has the deck untouched has it soft-deleted.
 */
export const SEED_VERSION = 2;

/** The retired starter deck. Installs from before seed version 2 may still hold it. */
const STARTER_DECK_ID = 'hsk1-traditional';

/** Whether a card is one the retired seed wrote, rather than one the learner made or imported. */
export function isSeededCard(card: Pick<Card, 'id' | 'deckId'>): boolean {
  return card.deckId === STARTER_DECK_ID && card.id.startsWith(`${STARTER_DECK_ID}:`);
}

export async function seedIfNeeded(now: number): Promise<{ seeded: boolean; deckCount: number }> {
  const recorded = (await db.settings.get('seedVersion'))?.value;
  if (recorded === SEED_VERSION) return { seeded: false, deckCount: 0 };

  // A starter deck the learner never answered a card of goes; one with study
  // history stays, as the learner's own. Soft-deleted so the removal syncs.
  const starter = await decks.get(STARTER_DECK_ID);
  if (starter && starter.deletedAt === null && (await db.attempts.where('deckId').equals(STARTER_DECK_ID).count()) === 0) {
    await decks.softDelete(STARTER_DECK_ID, now);
  }

  await db.settings.put({ key: 'seedVersion', value: SEED_VERSION });
  return { seeded: true, deckCount: 0 };
}
