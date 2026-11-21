// CC-CEDICT parser. Pinyin is numbered and lower-case, with ü written `v`
// (same convention as core/chinese/pinyin.ts `toNumbered`). A capitalised
// reading in the source marks a proper noun (`也 [Ye3] /surname Ye/`); the
// `proper` flag keeps that after lower-casing.

/**
 * @typedef {{ traditional: string, simplified: string, pinyin: string, proper: boolean, meanings: string[] }} CedictEntry
 */

const LINE = /^(\S+) (\S+) \[([^\]]*)\] \/(.*)\/\s*$/;

/**
 * @param {string} text
 * @returns {Map<string, CedictEntry[]>} keyed by traditional and by simplified
 */
export function parseCedict(text) {
  /** @type {Map<string, CedictEntry[]>} */
  const map = new Map();
  for (const line of text.split(/\r?\n/)) {
    if (!line || line.startsWith('#')) continue;
    const m = LINE.exec(line);
    if (!m) continue;
    /** @type {CedictEntry} */
    const entry = {
      traditional: m[1],
      simplified: m[2],
      pinyin: m[3].toLowerCase().replace(/u:/g, 'v'),
      proper: /^\p{Lu}/u.test(m[3]),
      meanings: m[4].split('/').filter(Boolean),
    };
    for (const key of new Set([entry.traditional, entry.simplified])) {
      const list = map.get(key);
      if (list) list.push(entry);
      else map.set(key, [entry]);
    }
  }
  return map;
}
