import { parsePinyin } from '~core/chinese/pinyin';
import { toZhuyin } from '~core/chinese/zhuyin';
import { cards, decks } from '~core/db/repositories';
import type { Card, Deck } from '~core/db/schema';
import { RADICALS, radicalId, variantText } from '~core/radicals';

export const RADICAL_DECK_ID = 'radicals';

/**
 * The radicals as a deck to review, one recognition card each: see the
 * radical, recall its name and meaning. Ids derive from the Kangxi number,
 * so adding the deck twice, or on two devices, makes the same cards.
 */
export async function addRadicalDeck(now: number): Promise<{ added: number }> {
  const existing = await decks.get(RADICAL_DECK_ID);
  if (!existing || existing.deletedAt !== null) {
    const deck: Deck = {
      id: RADICAL_DECK_ID,
      name: 'Radicals',
      description: 'The radicals that make up most characters, with the forms they take inside one.',
      colorToken: 'var(--chart-series-3)',
      tag: 'Radicals',
      translationLang: 'en',
      createdAt: existing?.createdAt ?? now,
      updatedAt: now,
      deletedAt: null,
    };
    await decks.put(deck);
  }

  let added = 0;
  for (const radical of RADICALS) {
    const id = `${RADICAL_DECK_ID}:${radicalId(radical)}`;
    // A card the learner deleted stays deleted.
    if (await cards.get(id)) continue;
    const pinyin = parsePinyin(radical.pinyin);
    const example = radical.examples[0]!;
    const variants = variantText(radical);
    const card: Card = {
      id,
      deckId: RADICAL_DECK_ID,
      hanzi: radical.radical,
      pinyin,
      zhuyin: toZhuyin(pinyin),
      translation: radical.meaning,
      pos: 'noun',
      example: example.hanzi,
      examplePinyin: example.pinyin,
      exampleTranslation: example.meaning,
      tags: ['radical'],
      note: [variants, `Radical ${radical.number}, ${radical.strokes} stroke${radical.strokes === 1 ? '' : 's'}`].filter(Boolean).join('. '),
      createdAt: now,
      updatedAt: now,
      deletedAt: null,
    };
    await cards.create(card, ['recognition'], now);
    added += 1;
  }
  return { added };
}

/** Whether the deck is in the collection, not deleted. */
export async function hasRadicalDeck(): Promise<boolean> {
  const deck = await decks.get(RADICAL_DECK_ID);
  return !!deck && deck.deletedAt === null;
}
