import hsk1 from './data/hsk1.json';
import { parsePinyin } from '~core/chinese/pinyin';
import { toZhuyin } from '~core/chinese/zhuyin';
import { db } from '~core/db/db';
import { cards, decks } from '~core/db/repositories';
import type { Card, Deck, PartOfSpeech } from '~core/db/schema';
import { validateCard } from '~core/import/validate';
import type { CardDraft } from '~core/import/validate';

/** Bump when decks are added. Existing cards are never rewritten. */
export const SEED_VERSION = 1;

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
 * Ids are derived from the deck and each entry's own stable `id` field,
 * never from the hanzi. A hanzi-derived id would mint a new id — and so a
 * duplicate, orphaning the old row — the moment a later `SEED_VERSION`
 * corrects a typo in the seed source's own headword. The entry's `id` never
 * changes across such a correction, so the existing card is still found and
 * the per-card guard below still recognises it as already created.
 */
function seedCardId(deckId: string, entryId: string): string {
  return `${deckId}:${entryId}`;
}

/** Whether a card is one the seed wrote, rather than one the learner made or imported. */
export function isSeededCard(card: Pick<Card, 'id' | 'deckId'>): boolean {
  return SEEDS.some((seed) => card.deckId === seed.id && card.id.startsWith(`${seed.id}:`));
}

/**
 * Runs every entry in every seed deck through the shared validator before
 * `seedIfNeeded` writes anything — a bad `hsk1.json` (or any future seed
 * file) must never leave a deck half-written. `existingHanzi` is rebuilt
 * per deck as entries are checked, so a duplicate hanzi *within* one seed
 * file is caught the same way a duplicate against a learner's own deck
 * would be during import.
 */
function validateSeeds(seeds: SeedDeck[]): void {
  for (const seed of seeds) {
    const existingHanzi = new Set<string>();
    for (const entry of seed.cards) {
      const draft: CardDraft = {
        hanzi: entry.hanzi,
        pinyin: entry.pinyin,
        translation: entry.translation,
        example: entry.example,
        examplePinyin: entry.examplePinyin,
        exampleTranslation: entry.exampleTranslation,
        tags: entry.tags,
      };
      const validated = validateCard(draft, existingHanzi, 'taiwan');
      if (!validated.ok) {
        const messages = validated.issues
          .filter((issue) => issue.severity === 'error')
          .map((issue) => issue.message)
          .join('; ');
        throw new Error(
          `Seed "${seed.name}" (${seed.id}) entry "${entry.id}" is invalid: ${messages}`,
        );
      }
      existingHanzi.add(validated.draft.hanzi);
    }
  }
}

export async function seedIfNeeded(now: number): Promise<{ seeded: boolean; deckCount: number }> {
  const recorded = (await db.settings.get('seedVersion'))?.value;
  if (recorded === SEED_VERSION) return { seeded: false, deckCount: SEEDS.length };

  validateSeeds(SEEDS);

  for (const seed of SEEDS) {
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
      const id = seedCardId(seed.id, entry.id);
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
