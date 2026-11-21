import 'fake-indexeddb/auto';
import { beforeEach, describe, expect, it } from 'vitest';
import { db } from '~core/db/db';
import { decks, reviews } from '~core/db/repositories';
import { isSeededCard, SEED_VERSION, seedIfNeeded } from '~core/seed/seed';
import { seedStarterDeck } from '../helpers/starterDeck';

const NOW = Date.parse('2026-11-21T08:00:00Z');
const STARTER = 'hsk1-traditional';

beforeEach(async () => {
  await db.delete();
  await db.open();
});

/** An install from before seed version 2: the starter deck is there and version 1 is recorded. */
async function oldInstall(): Promise<void> {
  await seedStarterDeck(NOW);
  await db.settings.put({ key: 'seedVersion', value: 1 });
}

describe('seedIfNeeded', () => {
  it('gives a fresh install no starter deck', async () => {
    const result = await seedIfNeeded(NOW);
    expect(result.seeded).toBe(true);
    expect(await db.decks.count()).toBe(0);
    expect(await db.cards.count()).toBe(0);
    expect((await db.settings.get('seedVersion'))?.value).toBe(SEED_VERSION);
  });

  it('is idempotent', async () => {
    await seedIfNeeded(NOW);
    expect((await seedIfNeeded(NOW)).seeded).toBe(false);
  });

  it('leaves an existing starter deck alone, reviewed or not', async () => {
    await oldInstall();
    await db.outbox.clear();
    await seedIfNeeded(NOW + 1000);
    expect((await decks.get(STARTER))!.deletedAt).toBeNull();
    expect(await db.outbox.count()).toBe(0);

    const item = (await db.items.toArray())[0]!;
    await reviews.record({ item, before: item, grade: 3, reviewedAt: NOW, durationMs: 1 });
    await db.settings.put({ key: 'seedVersion', value: 1 });
    await seedIfNeeded(NOW + 2000);
    expect((await decks.get(STARTER))!.deletedAt).toBeNull();
  });
});

describe('isSeededCard', () => {
  it('still recognises the retired starter cards', async () => {
    await seedStarterDeck(NOW);
    const card = (await db.cards.toArray())[0]!;
    expect(isSeededCard(card)).toBe(true);
    expect(isSeededCard({ id: 'c1', deckId: 'd1' })).toBe(false);
  });
});
