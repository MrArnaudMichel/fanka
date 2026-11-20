import { parsePinyin, toNumbered, wrongScriptCharactersIn } from './core.mjs';
import { segment, isHan } from './segment.mjs';

const MIN_HAN = 4;
const MAX_HAN = 20;
const MAX_EXCEPTIONS = 1;

const HAN_ONLY = /[^\p{Script=Han}]/gu;

/** Han characters of a headword, dropping homograph digits and marks ("好1"). */
export const cleanHanzi = (/** @type {string} */ s) => s.replace(HAN_ONLY, '');

/** Han parts of a headword split on non-Han (e.g. "不…不" gives two parts). */
const hanParts = (/** @type {string} */ s) => s.split(HAN_ONLY).filter(Boolean);

const INITIALS = 'zh|ch|sh|[bpmfdtnlgkhjqxrzcsyw]';
const FINALS = [
  'iang', 'iong', 'uang', 'ueng', 'iao', 'ian', 'uai', 'uan', 'van', 'ang', 'eng', 'ing', 'ong',
  'ai', 'ei', 'ao', 'ou', 'an', 'en', 'er', 'ia', 'ie', 'iu', 'in', 'ua', 'uo', 'ui', 'un', 've', 'vn',
  'a', 'o', 'e', 'i', 'u', 'v',
].join('|');
const ZERO = 'a|o|e|ai|ei|ao|ou|an|en|ang|eng|er';
const Y = 'i|a|e|ao|ou|an|in|ang|ing|ong|u|ue|uan|un';
const W = 'u|a|o|ai|ei|an|en|ang|eng';
const OTHER = 'zh|ch|sh|[bpmfdtnlgkhjqxrzcs]';
const SYLLABLE = new RegExp(`^(?:(?:${OTHER})(?:${FINALS})|(?:${ZERO})|y(?:${Y})|w(?:${W})|r)$`);

/** Removes tone marks, mapping ü to v, one character for one character. */
function plainLetters(/** @type {string} */ s) {
  return s
    .normalize('NFC')
    .replace(/[āáǎà]/g, 'a')
    .replace(/[ēéěè]/g, 'e')
    .replace(/[īíǐì]/g, 'i')
    .replace(/[ōóǒò]/g, 'o')
    .replace(/[ūúǔù]/g, 'u')
    .replace(/[ǖǘǚǜü]/g, 'v')
    .toLowerCase();
}

/**
 * All ways to cut a plain token into syllables, as lists of [start, end).
 * Limited to a handful to stay cheap on odd input.
 * @param {string} plain
 * @returns {Array<Array<[number, number]>>}
 */
function cuts(plain) {
  /** @type {Map<number, Array<Array<[number, number]>>>} */
  const memo = new Map();
  /** @param {number} at @returns {Array<Array<[number, number]>>} */
  const go = (at) => {
    if (at === plain.length) return [[]];
    const hit = memo.get(at);
    if (hit) return hit;
    /** @type {Array<Array<[number, number]>>} */
    const res = [];
    for (let end = at + 1; end <= Math.min(plain.length, at + 6); end += 1) {
      if (!SYLLABLE.test(plain.slice(at, end))) continue;
      for (const rest of go(end)) {
        res.push([[at, end], ...rest]);
        if (res.length >= 64) break;
      }
    }
    memo.set(at, res);
    return res;
  };
  return go(0);
}

/**
 * Splits model pinyin into syllables (joined ones like "péngyou" included)
 * so their count equals `expected`. Returns the numbered pinyin, or null when
 * no cut fits. A trailing erhua "r" is tolerated.
 * @param {string} raw
 * @param {number} expected
 * @returns {string | null}
 */
export function syllabify(raw, expected) {
  const tokens = raw
    .replace(/[^\p{L}\p{M}\s']/gu, ' ')
    .replace(/'/g, ' ')
    .split(/\s+/)
    .filter(Boolean);
  /** @type {Array<Array<string>>} */
  let options = [[]];
  for (const token of tokens) {
    const plain = plainLetters(token);
    const marked = token.normalize('NFC');
    const all = cuts(plain);
    if (all.length === 0) return null;
    // Prefer cuts where no syllable holds two tone marks, then fewer syllables variety is handled by count.
    const variants = new Set(
      all.map((c) => c.map(([s, e]) => marked.slice(s, e)).join(' ')),
    );
    const next = [];
    for (const prefix of options) {
      for (const v of variants) {
        next.push([...prefix, v]);
        if (next.length >= 256) break;
      }
    }
    options = next;
  }
  for (const opt of options) {
    const syllables = opt.join(' ').split(' ').filter(Boolean);
    if (syllables.length !== expected) continue;
    const marks = (s) => (s.normalize('NFD').match(/[̄́̌̀]/g) ?? []).length;
    if (syllables.some((s) => marks(s) > 1)) continue;
    return toNumbered(syllables.flatMap((s) => parsePinyin(s)));
  }
  return null;
}

const bare = (/** @type {string} */ syl) => syl.replace(/[1-5]$/, '');

/**
 * Pinyin for an example, taken from the word list where possible.
 *
 * CITATION tones are stored (dictionary practice): no tone sandhi is applied,
 * so 不要 stays "bu4 yao4" and 一本 stays "yi1 ben3"; the learner UI can apply
 * sandhi at display time if wanted. Erhua keeps the word list's convention of
 * a standalone "r5" syllable for the character 儿, so the pinyin always has one
 * syllable per Han character.
 *
 * For each Han segment that is a known word, the reading is the one matching
 * the model's syllables (exact, then ignoring tone), else the first reading.
 * An unknown single character is looked up in `charReadings` (CC-CEDICT):
 * the entry matching the model syllable, else the model syllable. Any other
 * unknown segment uses the model's syllables. Non-Han segments add nothing.
 * @param {string[]} segments
 * @param {(w: string) => string | string[] | undefined} readingOf numbered, space-separated reading(s)
 * @param {string[]} modelSyllables numbered, one per Han character
 * @param {(ch: string) => string[] | undefined} [charReadings] numbered single syllables
 * @returns {string}
 */
export function examplePinyin(segments, readingOf, modelSyllables, charReadings) {
  return derive(segments, readingOf, modelSyllables, charReadings).pinyin;
}

/** @returns {{ pinyin: string, tonelessFallback: boolean }} */
function derive(
  /** @type {string[]} */ segments,
  /** @type {(w: string) => string | string[] | undefined} */ readingOf,
  /** @type {string[]} */ modelSyllables,
  /** @type {((ch: string) => string[] | undefined) | undefined} */ charReadings,
) {
  /** @type {string[]} */
  const out = [];
  let index = 0;
  let tonelessFallback = false;
  for (const seg of segments) {
    if (!isHan(seg)) continue;
    const n = [...seg].length;
    const model = modelSyllables.slice(index, index + n);
    index += n;
    const found = readingOf(seg);
    const readings = (Array.isArray(found) ? found : found ? [found] : [])
      .map((r) => r.split(/\s+/).filter(Boolean))
      .filter((r) => r.length === n);
    if (readings.length > 0) {
      const exact = readings.find((r) => r.every((x, i) => x === model[i]));
      const loose = readings.find((r) => r.every((x, i) => model[i] !== undefined && bare(x) === bare(model[i])));
      out.push(...(exact ?? loose ?? readings[0]));
      continue;
    }
    if (n === 1 && charReadings) {
      const options = charReadings(seg) ?? [];
      const hit = options.find((x) => x === model[0]) ?? options.find((x) => model[0] !== undefined && bare(x) === bare(model[0]));
      if (hit) {
        out.push(hit);
        continue;
      }
    }
    out.push(...model);
    if (n > 1 && model.length > 0 && model.every((x) => x.endsWith('5'))) tonelessFallback = true;
  }
  return { pinyin: out.join(' '), tonelessFallback };
}

/**
 * @param {{ text: string, pinyin: string, translation: string }} ex
 * @param {{ hanzi: string, variants?: string[] }} word
 * @param {ReadonlySet<string>} allowed
 * @param {'mainland' | 'taiwan'} bundle
 * @param {(w: string) => string | string[] | undefined} [readingOf]
 * @param {(ch: string) => string[] | undefined} [charReadings]
 * @returns {{ ok: true, segments: string[], pinyin: string, modelPinyin: string } | { ok: false, reasons: string[] }}
 */
export function checkExample(ex, word, allowed, bundle, readingOf = () => undefined, charReadings = undefined) {
  /** @type {string[]} */
  const reasons = [];
  const text = typeof ex.text === 'string' ? ex.text.trim() : '';
  if (!text) return { ok: false, reasons: ['no text'] };

  const forms = [word.hanzi, ...(word.variants ?? [])];
  const contains = forms.some((f) => {
    const parts = hanParts(f);
    return parts.length > 0 && parts.every((p) => text.includes(p));
  });
  if (!contains) reasons.push('missing word');

  const wrong = wrongScriptCharactersIn(text, bundle);
  if (wrong.length > 0) reasons.push(`wrong script: ${[...new Set(wrong)].join('')}`);

  const hanCount = [...text].filter((c) => isHan(c)).length;
  if (hanCount < MIN_HAN || hanCount > MAX_HAN) reasons.push(`length ${hanCount}`);

  const segments = segment(text, allowed);
  const unknown = segments.filter((s) => isHan(s) && !allowed.has(s));
  if (unknown.length > MAX_EXCEPTIONS) reasons.push(`unknown words: ${unknown.join(' ')}`);

  const pinyin = syllabify(typeof ex.pinyin === 'string' ? ex.pinyin : '', hanCount);
  if (pinyin === null) reasons.push('pinyin syllable count');

  let derived = '';
  if (pinyin !== null) {
    const d = derive(segments, readingOf, pinyin.split(' '), charReadings);
    derived = d.pinyin;
    if (d.tonelessFallback) reasons.push('toneless pinyin');
  }

  if (typeof ex.translation !== 'string' || !ex.translation.trim()) reasons.push('no translation');

  if (reasons.length > 0) return { ok: false, reasons };
  return { ok: true, segments, pinyin: derived, modelPinyin: /** @type {string} */ (pinyin) };
}
