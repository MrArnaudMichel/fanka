// Normalises the TBCL spreadsheet rows into Word records (Taiwan).
import { dedupeLowestLevel, assignIds } from './order.mjs';
import { fromZhuyin, toNumbered } from './core.mjs';

/** @typedef {import('../../../core/curriculum/types').Word} Word */
/** @typedef {import('./cedict.mjs').CedictEntry} CedictEntry */

/**
 * First reading of a bopomofo cell, cleaned for `fromZhuyin`: alternatives are
 * separated by `/` (with or without spaces), spaces may be ideographic, the
 * vowel ㄧ is sometimes typed as the Han character 一, the neutral dot may
 * trail, and syllables are sometimes run together after a tone mark.
 * @param {string} cell
 * @returns {string}
 */
export function firstZhuyin(cell) {
  const first = cell.split('/').map((s) => s.trim()).find(Boolean) ?? '';
  return first
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

const stripTones = (/** @type {string} */ pinyin) => pinyin.replace(/[1-5]/g, '');

/**
 * CC-CEDICT meanings for a traditional word: exact pinyin, then pinyin
 * ignoring tones, then the traditional form alone.
 * @param {Map<string, CedictEntry[]>} cedict
 * @param {string} hanzi
 * @param {string} pinyin numbered
 * @returns {string[]}
 */
function meaningsFor(cedict, hanzi, pinyin) {
  const entries = (cedict.get(hanzi) ?? []).filter((e) => e.traditional === hanzi);
  const hit =
    entries.find((e) => e.pinyin === pinyin) ??
    entries.find((e) => stripTones(e.pinyin) === stripTones(pinyin)) ??
    entries[0];
  return hit ? hit.meanings : [];
}

/**
 * @param {string[][]} rows header first
 * @param {Map<string, CedictEntry[]>} cedict
 * @returns {Array<Word & { needsMeaning?: true }>} without lesson / example
 */
export function tbclWords(rows, cedict) {
  const [header = [], ...body] = rows;
  const col = (/** @type {string[]} */ row, /** @type {string} */ name) => {
    const i = header.indexOf(name);
    return i < 0 ? '' : (row[i] ?? '').trim();
  };

  const staged = [];
  for (const row of body) {
    const word = col(row, 'word');
    const level = Number(/(\d+)/.exec(col(row, 'ji'))?.[1]);
    if (!word || !Number.isInteger(level)) continue;
    const [hanzi, ...variants] = word.split('/').map((s) => s.trim()).filter(Boolean);
    const zhuyin = firstZhuyin(col(row, 'bopomofo'));
    if (zhuyin === '') continue;
    const pinyin = toNumbered(fromZhuyin(zhuyin));
    const meanings = meaningsFor(cedict, hanzi, pinyin);
    staged.push({
      hanzi,
      variants,
      level,
      core: col(row, 'situation') === '核心詞',
      frequency: (Number(col(row, 'wfreq')) || 0) + (Number(col(row, 'sfreq')) || 0),
      id: Number(col(row, 'id')) || 0,
      reading: { pinyin, zhuyin, meanings },
    });
  }
  staged.sort(
    (a, b) => Number(b.core) - Number(a.core) || b.frequency - a.frequency || a.id - b.id,
  );
  const unique = dedupeLowestLevel(staged);
  return assignIds(
    unique.map(({ hanzi, variants, level, reading }) => ({
      hanzi,
      ...(variants.length > 0 ? { variants } : {}),
      readings: [reading],
      level,
      ...(reading.meanings.length === 0 ? { needsMeaning: /** @type {const} */ (true) } : {}),
    })),
    'tbcl',
  );
}
