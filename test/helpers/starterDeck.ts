import hsk1 from '~core/seed/data/hsk1.json';
import { parsePinyin } from '~core/chinese/pinyin';
import { toZhuyin } from '~core/chinese/zhuyin';
import { cards, decks } from '~core/db/repositories';
import type { Card, Deck, PartOfSpeech } from '~core/db/schema';

interface SeedCard {
  id: string;
  hanzi: string;
  pinyin: string;
  translation: string;
  pos: PartOfSpeech;
  example: string;
  examplePinyin: string;
  exampleTranslation: string;
  tags: string[];
}

/**
 * Writes the 20-word starter deck that installs before seed version 2 had, so
 * tests can start from a populated database. The app no longer seeds it.
 */
export async function seedStarterDeck(now: number): Promise<void> {
  const seed = hsk1 as { id: string; name: string; description: string; colorToken: string; tag: string; cards: SeedCard[] };
  const deck: Deck = {
    id: seed.id,
    name: seed.name,
    description: seed.description,
    colorToken: seed.colorToken,
    tag: seed.tag,
    bundle: 'taiwan',
    translationLang: 'en',
    createdAt: now,
    updatedAt: now,
    deletedAt: null,
  };
  if (!(await decks.get(deck.id))) await decks.put(deck);
  for (const entry of seed.cards) {
    const id = `${seed.id}:${entry.id}`;
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
