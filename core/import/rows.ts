/**
 * Import-only rules on top of `validateCard`: a card already in the deck is
 * a duplicate the learner chooses to skip or update, not an error; the same
 * hanzi twice in one file is an error, so two rows never fight over one
 * card. Pure: no Vue, Dexie or Capacitor.
 */
import { parsePinyin } from '~core/chinese/pinyin';
import { toZhuyin } from '~core/chinese/zhuyin';
import type { Card } from '~core/db/schema';
import { type CardDraft, type Validated, validateCard } from '~core/import/validate';

export type DuplicatePolicy = 'skip' | 'update';

export interface ImportRow extends Validated {
  /** Valid, and its hanzi is already a live card in the destination deck. */
  duplicate: boolean;
}

export const REPEATED_MESSAGE = 'Repeated earlier in this file';

const NONE: ReadonlySet<string> = new Set();

export function validateImportRows(drafts: readonly CardDraft[], deckHanzi: ReadonlySet<string>): ImportRow[] {
  const seen = new Set<string>();
  return drafts.map((draft) => {
    const validated = validateCard(draft, NONE);
    const hanzi = validated.draft.hanzi;
    const issues = [...validated.issues];
    if (hanzi && seen.has(hanzi)) issues.push({ field: 'hanzi', severity: 'error', message: REPEATED_MESSAGE });
    const ok = issues.every((issue) => issue.severity !== 'error');
    if (ok) seen.add(hanzi);
    return { draft: validated.draft, issues, ok, duplicate: ok && deckHanzi.has(hanzi) };
  });
}

/** A pinyin string (numbered or diacritic) in the joined diacritic form the schema stores — same conversion useCardEditor.ts applies. */
export function normalisePinyinText(text: string): string {
  return parsePinyin(text)
    .map((s) => s.text)
    .join(' ');
}

/**
 * A mapped zhuyin column wins. Without one, the card keeps its zhuyin while
 * the pinyin is unchanged — it may have been corrected by hand — and gets a
 * derived one when the pinyin changed, so the two never disagree.
 */
function nextZhuyin(card: Card, draft: CardDraft, pinyin: Card['pinyin']): string {
  if (draft.zhuyin && draft.zhuyin.length > 0) return draft.zhuyin;
  if (card.zhuyin && JSON.stringify(card.pinyin) === JSON.stringify(pinyin)) return card.zhuyin;
  return toZhuyin(pinyin);
}

/**
 * The card after an import row updates it. Items and reviews are separate
 * rows and stay as they are, so progress is kept. A field the file did not
 * map (undefined in the draft) keeps the card's value; a mapped field
 * replaces it, even when empty.
 */
export function updatedCardFromDraft(card: Card, draft: CardDraft, now: number): Card {
  const pinyin = parsePinyin(draft.pinyin);
  return {
    ...card,
    pinyin,
    zhuyin: nextZhuyin(card, draft, pinyin),
    translation: draft.translation,
    example: draft.example ?? card.example,
    examplePinyin: draft.examplePinyin === undefined ? card.examplePinyin : normalisePinyinText(draft.examplePinyin),
    exampleTranslation: draft.exampleTranslation ?? card.exampleTranslation,
    tags: draft.tags === undefined ? card.tags : [...draft.tags],
    updatedAt: now,
  };
}

/**
 * Whether an import update would change anything the learner sees: the
 * fields `updatedCardFromDraft` writes. An unchanged card is left alone, so
 * re-importing a file does not queue a sync write per row.
 */
export function sameCardContent(a: Card, b: Card): boolean {
  return (
    a.zhuyin === b.zhuyin &&
    a.translation === b.translation &&
    a.example === b.example &&
    a.examplePinyin === b.examplePinyin &&
    a.exampleTranslation === b.exampleTranslation &&
    JSON.stringify(a.pinyin) === JSON.stringify(b.pinyin) &&
    JSON.stringify(a.tags) === JSON.stringify(b.tags)
  );
}
