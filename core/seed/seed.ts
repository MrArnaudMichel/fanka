import hsk1 from './data/hsk1.json';
import { parsePinyin } from '~core/chinese/pinyin';
import { toZhuyin } from '~core/chinese/zhuyin';
import { db } from '~core/db/db';
import { cards, decks } from '~core/db/repositories';
import type { Card, Deck, PartOfSpeech } from '~core/db/schema';

/** Bump when decks are added. Existing cards are never rewritten. */
export const SEED_VERSION = 1;

interface SeedCard {
  hanzi: string;
  pinyin: string;
  translation: string;
  pos: PartOfSpeech;
  example: string;
  examplePinyin: string;
  exampleTranslation: string;
  tags: string[];
}

interface SeedDeck {
  id: string;
  name: string;
  description: string;
  colorToken: string;
  tag: string;
  cards: SeedCard[];
}

const SEEDS: SeedDeck[] = [hsk1 as SeedDeck];

/**
 * Ids are derived from the deck and the characters rather than random, so a
 * second run recognises a card it already created and leaves the learner's
 * edits to it alone.
 */
function seedCardId(deckId: string, hanzi: string): string {
  return `${deckId}:${hanzi}`;
}

export async function seedIfNeeded(now: number): Promise<{ seeded: boolean; deckCount: number }> {
  const recorded = (await db.settings.get('seedVersion'))?.value;
  if (recorded === SEED_VERSION) return { seeded: false, deckCount: SEEDS.length };

  for (const seed of SEEDS) {
    const deck: Deck = {
      id: seed.id,
      name: seed.name,
      description: seed.description,
      colorToken: seed.colorToken,
      tag: seed.tag,
      translationLang: 'en',
      createdAt: now,
      updatedAt: now,
      deletedAt: null,
    };
    if (!(await decks.get(deck.id))) await decks.put(deck);

    for (const entry of seed.cards) {
      const id = seedCardId(seed.id, entry.hanzi);
      if (await cards.get(id)) continue;

      const pinyin = parsePinyin(entry.pinyin);
      const card: Card = {
        id,
        deckId: seed.id,
        hanzi: entry.hanzi,
        pinyin,
        zhuyin: toZhuyin(pinyin),
        translation: entry.translation,
        pos: entry.pos,
        example: entry.example,
        examplePinyin: parsePinyin(entry.examplePinyin).map((s) => s.text).join(' '),
        exampleTranslation: entry.exampleTranslation,
        tags: entry.tags,
        note: '',
        createdAt: now,
        updatedAt: now,
        deletedAt: null,
      };
      await cards.create(card, ['recognition', 'production'], now);
    }
  }

  await db.settings.put({ key: 'seedVersion', value: SEED_VERSION });
  return { seeded: true, deckCount: SEEDS.length };
}
