// Normalises the TBCL spreadsheet rows into Word records (Taiwan).
import { dedupeLowestLevel, assignIds } from './order.mjs';
import { fromZhuyin, toNumbered } from './core.mjs';
import { cleanMeanings, isWeakOnly } from './senses.mjs';

/** @typedef {import('../../../core/curriculum/types').Word} Word */
/** @typedef {import('./cedict.mjs').CedictEntry} CedictEntry */

/**
 * Source errors in the TBCL list, keyed by the raw `word` cell.
 * - 橘子: the bopomofo cell gives ㄐㄩˊ alone, one syllable for two characters.
 * - 有助（於）: the optional 於 has no syllable in the bopomofo cell.
 * - 晒/曬: 晒 is the simplified form of 曬 and Taiwan writes 曬, so 曬 is the
 *   headword. 晒 stays a variant in the source order, and the script guard
 *   then drops it (a failing variant is dropped, the word kept).
 * @type {Record<string, { word?: string, bopomofo?: string }>}
 */
export const OVERRIDES = {
  橘子: { bopomofo: 'ㄐㄩˊ ˙ㄗ' },
  '有助（於）': { bopomofo: 'ㄧㄡˇ ㄓㄨˋ (ㄩˊ)' },
  '晒/曬': { word: '曬/晒' },
};

/**
 * One bopomofo alternative cleaned for `fromZhuyin`: spaces may be
 * ideographic, the vowel ㄧ is sometimes typed as the Han character 一, the
 * neutral dot may trail, and syllables are sometimes run together after a
 * tone mark.
 * @param {string} alternative
 * @returns {string}
 */
function cleanZhuyin(alternative) {
  return alternative
    .replace(/\([一二三]\)/g, '') // sense markers such as "(一)"
    .replace(/[()]/g, '') // optional syllables: the pinyin spells them out
    .replace(/一/g, 'ㄧ')
    .replace(/ㄧㄞ/g, 'ㄧㄚ') // 崖 is typed yai2, a spelling zhuyin does not have
    .replace(/\s+([ˊˇˋ])/g, '$1') // tone mark detached from its syllable
    .replace(/([ˊˇˋ])(?=[ㄅ-ㄩ˙])/g, '$1 ')
    .replace(/([ㄚ-ㄩ])(?=[ㄅ-ㄙ])/g, '$1 ') // syllables run together with no tone mark between
    .replace(/([ㄚ-ㄥㄧ-ㄩ])(?=ㄦ)/g, '$1 ')
    .split(/[\s\u3000]+/)
    .filter(Boolean)
    .map((s) => (s.endsWith('˙') ? `˙${s.slice(0, -1)}` : s))
    .join(' ');
}

/**
 * The readings of a bopomofo cell, cleaned: alternatives are separated by
 * `/` (with or without spaces).
 * @param {string} cell
 * @returns {string[]}
 */
export function zhuyinAlternatives(cell) {
  return cell
    .split('/')
    .map((s) => cleanZhuyin(s.trim()))
    .filter(Boolean);
}

/** First reading of a bopomofo cell, cleaned. */
export const firstZhuyin = (/** @type {string} */ cell) => zhuyinAlternatives(cell)[0] ?? '';

const hanCount = (/** @type {string} */ s) => [...s.replace(/[^\p{Script=Han}]/gu, '')].length;
const syllableCount = (/** @type {string} */ pinyin) => pinyin.split(/\s+/).filter(Boolean).length;

const stripTones = (/** @type {string} */ pinyin) => pinyin.replace(/[1-5]/g, '');

/**
 * The CC-CEDICT entry has a neutral tone where the TBCL reading has a full
 * one, and is otherwise the same: Taiwan's full-tone reading of a word that
 * Mainland reads with a neutral tone (告訴 gào sù, CC-CEDICT gao4 su5 "to
 * tell" next to gao4 su4 "to press charges").
 */
function neutralised(/** @type {string} */ entry, /** @type {string} */ pinyin) {
  const a = entry.split(' ');
  const b = pinyin.split(' ');
  if (a.length !== b.length) return false;
  let differs = false;
  for (let i = 0; i < a.length; i += 1) {
    if (a[i] === b[i]) continue;
    if (!a[i].endsWith('5') || stripTones(a[i]) !== stripTones(b[i])) return false;
    differs = true;
  }
  return differs;
}

/**
 * How well a CC-CEDICT entry matches a TBCL reading, best first, or -1.
 * @param {CedictEntry} e
 * @param {string} pinyin
 * @param {string[]} siblings the word's other readings
 */
function matchRank(e, pinyin, siblings) {
  if (neutralised(e.pinyin, pinyin) && !siblings.includes(e.pinyin)) return 0;
  if (e.pinyin === pinyin) return 1;
  if (e.meanings.some((m) => m.replace(/u:/g, 'v').includes(`Taiwan pr. [${pinyin}]`))) return 2;
  if (stripTones(e.pinyin) === stripTones(pinyin)) return 3;
  return -1;
}

/**
 * CC-CEDICT meanings for one reading of a traditional word. Every entry whose
 * pinyin matches (exact, Taiwan's full tone for a neutral one, a "Taiwan pr."
 * note, or ignoring tones) is merged, common nouns before proper nouns, and
 * entries that are only a surname, a variant or a cross-reference are left
 * out while another sense remains. With no match, the traditional form alone
 * decides. The glosses are then cleaned (see senses.mjs).
 * @param {Map<string, CedictEntry[]>} cedict
 * @param {string} hanzi
 * @param {string} pinyin numbered
 * @param {string[]} [siblings] the word's other readings
 * @returns {string[]}
 */
function meaningsFor(cedict, hanzi, pinyin, siblings = []) {
  const entries = (cedict.get(hanzi) ?? []).filter((e) => e.traditional === hanzi);
  let ranked = entries.map((e, index) => ({ e, index, rank: matchRank(e, pinyin, siblings), weak: isWeakOnly(e.meanings) }));
  if (ranked.some((r) => r.rank >= 0)) ranked = ranked.filter((r) => r.rank >= 0);
  if (ranked.some((r) => !r.weak)) ranked = ranked.filter((r) => !r.weak);
  ranked.sort((a, b) => Number(a.e.proper) - Number(b.e.proper) || a.rank - b.rank || a.index - b.index);
  return cleanMeanings(ranked.flatMap((r) => r.e.meanings), 'taiwan');
}

/**
 * The rows of the list, parsed: forms (homograph digits stripped, overrides
 * applied) and the readings of the headword, without meanings.
 * @param {string[][]} rows header first
 */
function parseRows(rows) {
  const [header = [], ...body] = rows;
  const col = (/** @type {string[]} */ row, /** @type {string} */ name) => {
    const i = header.indexOf(name);
    return i < 0 ? '' : (row[i] ?? '').trim();
  };
  const parsed = [];
  for (const row of body) {
    const override = OVERRIDES[col(row, 'word')] ?? {};
    const word = override.word ?? col(row, 'word');
    const level = Number(/(\d+)/.exec(col(row, 'ji'))?.[1]);
    if (!word || !Number.isInteger(level)) continue;
    // Homographs are numbered in the source (長1, 長2); the digit is not part of the word.
    const [hanzi, ...rest] = word
      .split('/')
      .map((s) => s.trim().replace(/\d+$/, ''))
      .filter(Boolean);
    const variants = rest.filter((v) => v !== hanzi);
    const alternatives = zhuyinAlternatives(override.bopomofo ?? col(row, 'bopomofo')).map((zhuyin) => ({
      zhuyin,
      pinyin: toNumbered(fromZhuyin(zhuyin)),
    }));
    if (alternatives.length === 0) continue;
    // The alternatives of a row with several forms follow the forms: the
    // headword takes the one with a syllable per character. A single-form
    // row keeps every such alternative as a reading. With none, the first
    // stands, and the build fails on the mismatch (syllableMismatches).
    const fitting = alternatives.filter((a) => syllableCount(a.pinyin) === hanCount(hanzi));
    const chosen = fitting.length === 0 ? alternatives.slice(0, 1) : variants.length > 0 ? fitting.slice(0, 1) : fitting;
    const readings = chosen.filter((a, i) => chosen.findIndex((b) => b.pinyin === a.pinyin) === i);
    parsed.push({
      hanzi,
      variants,
      level,
      readings,
      core: col(row, 'situation') === '核心詞',
      frequency: (Number(col(row, 'wfreq')) || 0) + (Number(col(row, 'sfreq')) || 0),
      id: Number(col(row, 'id')) || 0,
    });
  }
  return parsed;
}

/**
 * The TBCL readings of each headword, with the level of the row that gives
 * them: the Mainland ranking cross-checks its readings against these.
 * @param {string[][]} rows header first
 * @returns {(traditional: string) => Array<{ pinyin: string, level: number }>}
 */
export function tbclReadingLevels(rows) {
  /** @type {Map<string, Array<{ pinyin: string, level: number }>>} */
  const map = new Map();
  for (const { hanzi, level, readings } of parseRows(rows)) {
    const list = map.get(hanzi) ?? [];
    for (const { pinyin } of readings) list.push({ pinyin, level });
    map.set(hanzi, list);
  }
  return (traditional) => map.get(traditional) ?? [];
}

/**
 * @param {string[][]} rows header first
 * @param {Map<string, CedictEntry[]>} cedict
 * @returns {Array<Word & { needsMeaning?: true }>} without lesson / example
 */
export function tbclWords(rows, cedict) {
  const parsed = parseRows(rows);
  // Every reading of a headword, homograph rows included (得2 de5, 得3 de2).
  /** @type {Map<string, Set<string>>} */
  const readingsOf = new Map();
  for (const { hanzi, readings } of parsed) {
    const set = readingsOf.get(hanzi) ?? new Set();
    for (const r of readings) set.add(r.pinyin);
    readingsOf.set(hanzi, set);
  }
  const staged = [];
  for (const { readings: forms, ...row } of parsed) {
    const all = [...(readingsOf.get(row.hanzi) ?? [])];
    const readings = forms.map(({ zhuyin, pinyin }) => ({
      pinyin,
      zhuyin,
      meanings: meaningsFor(cedict, row.hanzi, pinyin, all.filter((p) => p !== pinyin)),
    }));
    staged.push({ ...row, readings });
  }
  staged.sort(
    (a, b) => Number(b.core) - Number(a.core) || b.frequency - a.frequency || a.id - b.id,
  );
  const unique = dedupeLowestLevel(staged);
  return assignIds(
    unique.map(({ hanzi, variants, level, readings }) => ({
      hanzi,
      ...(variants.length > 0 ? { variants } : {}),
      readings,
      level,
      ...(readings.some((r) => r.meanings.length === 0) ? { needsMeaning: /** @type {const} */ (true) } : {}),
    })),
    'tbcl',
  );
}
