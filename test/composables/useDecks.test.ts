import 'fake-indexeddb/auto';
import { beforeEach, describe, expect, it } from 'vitest';
import { useDecks } from '~/composables/useDecks';
import { db } from '~core/db/db';
import { DECK_COLORS } from '~core/db/repositories';

const NOW = Date.parse('2026-09-16T08:00:00Z');

beforeEach(async () => {
  await db.delete();
  await db.open();
});

describe('useDecks', () => {
  it('creates a deck and lists it back', async () => {
    const { create, listAll } = useDecks();
    const deck = await create({ name: 'HSK 1', description: '', colorToken: DECK_COLORS[0], tag: 'HSK' }, NOW);
    expect(deck.name).toBe('HSK 1');
    expect(await listAll()).toMatchObject([{ id: deck.id, name: 'HSK 1' }]);
  });

  it('updates a deck in place', async () => {
    const { create, update, listAll } = useDecks();
    const deck = await create({ name: 'HSK 1', description: '', colorToken: DECK_COLORS[0], tag: 'HSK' }, NOW);
    await update(deck.id, { name: 'HSK 1 renamed', colorToken: DECK_COLORS[2] }, NOW + 1);
    expect(await listAll()).toMatchObject([{ name: 'HSK 1 renamed', colorToken: DECK_COLORS[2] }]);
  });

  it('soft-deletes a deck so it drops out of listAll', async () => {
    const { create, remove, listAll } = useDecks();
    const deck = await create({ name: 'HSK 1', description: '', colorToken: DECK_COLORS[0], tag: 'HSK' }, NOW);
    await remove(deck.id, NOW + 1);
    expect(await listAll()).toEqual([]);
  });

  it('summaries reports a card-free deck as all zero', async () => {
    const { create, summaries } = useDecks();
    await create({ name: 'HSK 1', description: '', colorToken: DECK_COLORS[0], tag: 'HSK' }, NOW);
    const rows = await summaries(NOW);
    expect(rows).toMatchObject([{ total: 0, due: 0, fresh: 0, mature: 0, young: 0 }]);
  });
});
