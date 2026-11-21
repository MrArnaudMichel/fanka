import simplifiedOnly from './data/simplified-only.json';
import traditionalOnly from './data/traditional-only.json';

export type Bundle = 'mainland' | 'taiwan';

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
 * Characters the generated table lists as simplified-only that are standard
 * traditional characters in Taiwan: 霉 (mould, 發霉) is the simplified form of
 * 黴 but also a character of its own in Taiwan's standard list.
 */
for (const character of ['霉']) SIMPLIFIED_ONLY.delete(character);

/** A character that exists only in traditional form (the mirror of SIMPLIFIED_ONLY). */
const TRADITIONAL_ONLY = new Set<string>(traditionalOnly.characters);

function distinctIn(text: string, set: ReadonlySet<string>): string[] {
  const seen = new Set<string>();
  const found: string[] = [];
  for (const character of text) {
    if (set.has(character) && !seen.has(character)) {
      seen.add(character);
      found.push(character);
    }
  }
  return found;
}

/**
 * Returns the distinct characters of `text` that exist only in simplified
 * form, in order of first appearance.
 */
export function simplifiedCharactersIn(text: string): string[] {
  return distinctIn(text, SIMPLIFIED_ONLY);
}

/** Returns the distinct characters of `text` that exist only in traditional form, in order of first appearance. */
export function traditionalCharactersIn(text: string): string[] {
  return distinctIn(text, TRADITIONAL_ONLY);
}

/** The characters of `text` that belong to the other bundle's script: simplified for Taiwan, traditional for Mainland. */
export function wrongScriptCharactersIn(text: string, bundle: Bundle): string[] {
  return bundle === 'taiwan' ? simplifiedCharactersIn(text) : traditionalCharactersIn(text);
}
