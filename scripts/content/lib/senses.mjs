// English glosses as a learner sees them: CC-CEDICT cross-references reduced
// to the bundle's script, weak senses (surname, variant of, used in, see,
// abbreviations, classifiers) dropped while a real sense remains, at most
// three short glosses per reading.
import { wrongScriptCharactersIn } from './core.mjs';

/** Glosses shown per reading. */
export const MAX_GLOSSES = 3;
/** A longer gloss is cut at its last list separator, or dropped while a shorter one remains. */
export const MAX_GLOSS_LENGTH = 80;

/** Cuts a long gloss at its last "; " or ", " inside the limit, else returns it whole. */
function shorten(/** @type {string} */ gloss) {
  if (gloss.length <= MAX_GLOSS_LENGTH) return gloss;
  const head = gloss.slice(0, MAX_GLOSS_LENGTH);
  const cut = Math.max(head.lastIndexOf('; '), head.lastIndexOf(', '));
  return cut >= 20 ? gloss.slice(0, cut) : gloss;
}

const WEAK = new RegExp(
  [
    String.raw`^(?:\([^)]*\)\s*)?(?:(?:old|archaic|ancient|erhua|erroneous|unofficial|Japanese|literary|same as)\s+)*variant of\b`,
    String.raw`^used in\b`,
    String.raw`^see\b`,
    String.raw`^abbr\. (?:for|of)\b`,
    String.raw`^CL:`,
    String.raw`^(?:[\w-]+ )*pr\. \[`,
    String.raw`^also written\b`,
  ].join('|'),
  'i',
);
/** "surname Ye", not "surname and given name". */
const SURNAME = /^surname \p{Lu}/u;

/** A gloss that names no sense of its own. */
export const isWeakGloss = (/** @type {string} */ gloss) => SURNAME.test(gloss.trim()) || WEAK.test(gloss.trim());

const HAN = String.raw`[\p{Script=Han}·〇]+`;
const PAIR = new RegExp(`(${HAN})\\|(${HAN})(?:\\[[^\\]]*\\])?`, 'gu');
const SINGLE = new RegExp(`(${HAN})\\[[^\\]]*\\]`, 'gu');
/** "(Taiwan pr. [han4])", "(colloquial pr. [nèi])", "(old pr. [gu3 ji1])" */
const PRONUNCIATION = /\s*\((?:[\w-]+ )*pr\. \[[^)]*\)/g;
/** A whole gloss that is a pronunciation note: "Taiwan pr. [pang1]". */
const PRONUNCIATION_ONLY = /^(?:[\w-]+ )*pr\. \[/;

/**
 * Reduces CC-CEDICT references ("trad|simp[pinyin]", "X[pinyin]") to the
 * bundle's form and drops pronunciation notes. Returns null for a gloss that
 * is only a pronunciation note, or when Han text in the other script remains.
 * @param {string} gloss
 * @param {'mainland' | 'taiwan'} bundle
 * @returns {string | null}
 */
export function normaliseGloss(gloss, bundle) {
  const text = gloss
    .replace(PAIR, (_, trad, simp) => (bundle === 'taiwan' ? trad : simp))
    .replace(SINGLE, '$1')
    .replace(PRONUNCIATION, '')
    .trim();
  if (!text || PRONUNCIATION_ONLY.test(text) || wrongScriptCharactersIn(text, bundle).length > 0) return null;
  return text;
}

/**
 * @param {string[]} glosses in priority order
 * @param {'mainland' | 'taiwan'} bundle
 * @returns {string[]}
 */
export function cleanMeanings(glosses, bundle) {
  /** @type {string[]} */
  const kept = [];
  for (const g of glosses) {
    const raw = normaliseGloss(g, bundle);
    const n = raw === null ? null : shorten(raw);
    if (n !== null && !kept.includes(n)) kept.push(n);
  }
  const strong = kept.filter((g) => !isWeakGloss(g));
  const senses = strong.length > 0 ? strong : kept;
  const short = senses.filter((g) => g.length <= MAX_GLOSS_LENGTH);
  return (short.length > 0 ? short : senses).slice(0, MAX_GLOSSES);
}

/** Every gloss is weak (or there is none). */
export const isWeakOnly = (/** @type {string[]} */ glosses) => glosses.every(isWeakGloss);
