import 'fake-indexeddb/auto';
import { beforeEach, describe, expect, it } from 'vitest';
import { db } from '~core/db/db';
import { decks } from '~core/db/repositories';
import { validateCard } from '~core/import/validate';
import { RADICALS } from '~core/radicals';
import { addRadicalDeck, hasRadicalDeck, RADICAL_DECK_ID } from '~core/seed/radicals';

const NOW = Date.parse('2026-10-21T08:00:00Z');

beforeEach(async () => {
  await db.delete();
  await db.open();
});

describe('addRadicalDeck', () => {
  it('adds a deck with one recognition card per radical', async () => {
    expect(await hasRadicalDeck()).toBe(false);
    const { added } = await addRadicalDeck(NOW);
    expect(added).toBe(RADICALS.length);
    expect(await hasRadicalDeck()).toBe(true);
    expect(await db.cards.where('deckId').equals(RADICAL_DECK_ID).count()).toBe(RADICALS.length);
    const items = await db.items.toArray();
    expect(items).toHaveLength(RADICALS.length);
    expect(items.every((i) => i.dir === 'recognition')).toBe(true);
  });

  it('is idempotent', async () => {
    await addRadicalDeck(NOW);
    expect((await addRadicalDeck(NOW + 1)).added).toBe(0);
    expect(await db.cards.count()).toBe(RADICALS.length);
  });

  it('brings a deleted deck back, with its cards and their history', async () => {
    await addRadicalDeck(NOW);
    await decks.softDelete(RADICAL_DECK_ID, NOW + 1);
    expect(await hasRadicalDeck()).toBe(false);
    expect((await addRadicalDeck(NOW + 2)).added).toBe(0);
    expect(await hasRadicalDeck()).toBe(true);
  });

  it('writes cards the shared validator accepts', async () => {
    await addRadicalDeck(NOW);
    const seen = new Set<string>();
    for (const card of await db.cards.toArray()) {
      const pinyin = card.pinyin.map((s) => s.text).join(' ');
      const result = validateCard({ hanzi: card.hanzi, pinyin, translation: card.translation, example: card.example }, seen);
      expect(result.ok, card.hanzi).toBe(true);
      seen.add(card.hanzi);
    }
  });

  it('notes the variant forms on the card', async () => {
    await addRadicalDeck(NOW);
    const water = await db.cards.get(`${RADICAL_DECK_ID}:kangxi-85`);
    expect(water?.note).toBe('Written 氵 on the left. Radical 85, 4 strokes');
  });
});
