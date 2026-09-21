import simplifiedOnly from './data/simplified-only.json';

/**
 * A character that exists only in simplified form: it is a simplified
 * rendering of some traditional character and is never itself a valid
 * traditional character (see core/chinese/data/simplified-only.json for how
 * this set is generated). Characters such as 后, 干 and 里 — a simplified
 * form that is also a standalone traditional character — are deliberately
 * excluded.
 */
const SIMPLIFIED_ONLY = new Set<string>(simplifiedOnly.characters);

/**
 * Returns the distinct characters of `text` that exist only in simplified
 * form, in order of first appearance. Used to guard content that must stay
 * traditional-only — the seed data and, later, anything a learner imports.
 */
export function simplifiedCharactersIn(text: string): string[] {
  const seen = new Set<string>();
  const found: string[] = [];
  for (const character of text) {
    if (SIMPLIFIED_ONLY.has(character) && !seen.has(character)) {
      seen.add(character);
      found.push(character);
    }
  }
  return found;
}
