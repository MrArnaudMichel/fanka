// Normalises the complete-hsk-vocabulary JSON into Word records (Mainland).
import { dedupeLowestLevel, assignIds } from './order.mjs';
import { fromZhuyin, toNumbered } from './core.mjs';
import { cleanMeanings, isWeakOnly } from './senses.mjs';

/** @typedef {import('../../../core/curriculum/types').Word} Word */

const CLEAN_TOKEN = /^[a-z]+[1-5]?$/;

/** The neutral-tone dot trails some syllables here; zhuyin writes it first. */
const dotFirst = (/** @type {string} */ zhuyin) =>
  zhuyin.trim().split(/\s+/).map((s) => (s.endsWith('˙') ? `˙${s.slice(0, -1)}` : s)).join(' ');

/**
 * Numbered, lower-case pinyin with ü as `v`. The numeric transcription is used
 * when it is clean (a bare syllable counts as neutral); for the few entries
 * where it mixes in diacritics, the bopomofo transcription is read back.
 * @param {{ numeric?: string, bopomofo?: string }} transcriptions
 * @returns {string}
 */
export function numberedPinyin({ numeric = '', bopomofo = '' }) {
  const tokens = numeric.toLowerCase().replace(/u:/g, 'v').replace(/ü/g, 'v').trim().split(/\s+/);
  if (tokens.every((t) => CLEAN_TOKEN.test(t))) {
    return tokens.map((t) => (/[1-5]$/.test(t) ? t : `${t}5`)).join(' ');
  }
  return toNumbered(fromZhuyin(dotFirst(bopomofo)));
}

/** Part-of-speech tags of a particle in complete.json (u auxiliary, y modal). */
const PARTICLE = new Set(['u', 'y']);

/**
 * The readings of a complete.json entry, the commonest first. Its forms come
 * in CC-CEDICT order, proper nouns first, so they are regrouped:
 * - forms sharing a pinyin merge into one reading;
 * - a reading made only of surname, variant or cross-reference senses is
 *   dropped while another remains;
 * - then: a reading that is only a proper noun goes last; for a word tagged
 *   first as a particle, its neutral-tone reading leads (了 le5, 着 zhe5);
 *   then the lowest TBCL level of the same traditional form and reading
 *   (exact tone before toneless); then the reading with more senses.
 * Within a reading, real senses come before weak ones, common nouns before
 * proper nouns, and forms TBCL knows first. Glosses are cleaned (senses.mjs).
 * @param {any} entry
 * @param {(traditional: string) => Array<{ pinyin: string, level: number }>} [tbclReadings]
 * @returns {Word['readings']}
 */
function rankedReadings(entry, tbclReadings) {
  const particle = PARTICLE.has(Array.isArray(entry.pos) ? entry.pos[0] : '');
  const forms = (entry.forms ?? []).map((/** @type {any} */ form, /** @type {number} */ index) => {
    const pinyin = numberedPinyin(form.transcriptions ?? {});
    const meanings = form.meanings ?? [];
    const toneless = pinyin.replace(/[1-5]/g, '');
    let tbcl = Infinity;
    for (const r of tbclReadings?.(form.traditional) ?? []) {
      // Taiwan may read the same sense with another tone: ranked half a level lower.
      if (r.pinyin === pinyin) tbcl = Math.min(tbcl, r.level);
      else if (r.pinyin.replace(/[1-5]/g, '') === toneless) tbcl = Math.min(tbcl, r.level + 0.5);
    }
    return {
      pinyin,
      meanings,
      index,
      proper: /^\p{Lu}/u.test(form.transcriptions?.numeric ?? ''),
      weak: isWeakOnly(meanings),
      tbcl,
    };
  });
  /** @type {Map<string, typeof forms>} */
  const groups = new Map();
  for (const f of forms) groups.set(f.pinyin, [...(groups.get(f.pinyin) ?? []), f]);
  let list = [...groups.entries()].map(([pinyin, members]) => {
    members.sort((a, b) => Number(a.weak) - Number(b.weak) || Number(a.proper) - Number(b.proper) || a.tbcl - b.tbcl || a.index - b.index);
    return {
      pinyin,
      members,
      weak: members.every((m) => m.weak),
      proper: members.every((m) => m.proper),
      neutral: particle && /5$/.test(pinyin) && !pinyin.includes(' ') ? 0 : 1,
      tbcl: Math.min(...members.map((m) => m.tbcl)),
      senses: members.filter((m) => !m.weak).reduce((n, m) => n + m.meanings.length, 0),
      index: members[0].index,
    };
  });
  if (list.some((g) => !g.weak)) list = list.filter((g) => !g.weak);
  list.sort(
    (a, b) =>
      Number(a.proper) - Number(b.proper) ||
      a.neutral - b.neutral ||
      a.tbcl - b.tbcl ||
      b.senses - a.senses ||
      a.index - b.index,
  );
  return list.map((g) => ({ pinyin: g.pinyin, meanings: cleanMeanings(g.members.flatMap((m) => m.meanings), 'mainland') }));
}

/**
 * @param {unknown[]} complete
 * @param {{ tbclReadings?: (traditional: string) => Array<{ pinyin: string, level: number }> }} [options]
 *   the TBCL readings of a traditional form, with their levels (tbclReadingLevels)
 * @returns {Array<Word & { needsMeaning?: true }>} without lesson / example
 */
export function hskWords(complete, { tbclReadings } = {}) {
  /** @type {Array<{ hanzi: string, level: number, frequency: number, pos?: string, readings: Word['readings'] }>} */
  const staged = [];
  for (const raw of complete) {
    const entry = /** @type {any} */ (raw);
    const levels = (entry.level ?? [])
      .map((/** @type {string} */ l) => /^newest-(\d)$/.exec(l))
      .filter(Boolean)
      .map((/** @type {RegExpExecArray} */ m) => Number(m[1]));
    if (levels.length === 0) continue;
    const readings = rankedReadings(entry, tbclReadings);
    if (readings.length === 0) continue;
    staged.push({
      hanzi: entry.simplified,
      level: Math.min(...levels),
      frequency: typeof entry.frequency === 'number' ? entry.frequency : Infinity,
      pos: Array.isArray(entry.pos) && entry.pos.length > 0 ? entry.pos.join(',') : undefined,
      readings,
    });
  }
  // Frequency ascending (missing last); array order breaks ties, so the sort is stable.
  staged.sort((a, b) => (a.frequency === b.frequency ? 0 : a.frequency < b.frequency ? -1 : 1));
  const unique = dedupeLowestLevel(staged);
  return assignIds(
    unique.map(({ hanzi, level, pos, readings }) => ({
      hanzi,
      readings,
      ...(pos ? { pos } : {}),
      level,
    })),
    'hsk',
  );
}
