// Script guard for a word list: content is in its bundle's script, never mixed.
import { wrongScriptCharactersIn } from './core.mjs';

/**
 * A variant holding a character of the other script is dropped and the word
 * kept; a word whose headword holds one is excluded.
 * @template {{ id: string, hanzi: string, variants?: string[] }} T
 * @param {T[]} words
 * @param {'mainland' | 'taiwan'} bundle
 */
export function guardScript(words, bundle) {
  /** @type {T[]} */
  const kept = [];
  /** @type {Array<{ id: string, hanzi: string, wrong: string[] }>} */
  const excluded = [];
  /** @type {Array<{ id: string, variant: string, wrong: string[] }>} */
  const droppedVariants = [];
  for (const word of words) {
    const wrong = wrongScriptCharactersIn(word.hanzi, bundle);
    if (wrong.length > 0) {
      excluded.push({ id: word.id, hanzi: word.hanzi, wrong });
      continue;
    }
    if (!word.variants) {
      kept.push(word);
      continue;
    }
    const variants = word.variants.filter((variant) => {
      const bad = wrongScriptCharactersIn(variant, bundle);
      if (bad.length > 0) droppedVariants.push({ id: word.id, variant, wrong: bad });
      return bad.length === 0;
    });
    const { variants: _, ...rest } = word;
    kept.push(/** @type {T} */ (variants.length > 0 ? { ...rest, variants } : rest));
  }
  return { kept, excluded, droppedVariants };
}
