// Normalises the complete-hsk-vocabulary JSON into Word records (Mainland).
import { dedupeLowestLevel, assignIds } from './order.mjs';
import { fromZhuyin, toNumbered } from './core.mjs';

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

/**
 * @param {unknown[]} complete
 * @returns {Array<Word & { needsMeaning?: true }>} without lesson / example
 */
export function hskWords(complete) {
  /** @type {Array<{ hanzi: string, level: number, frequency: number, pos?: string, readings: Word['readings'] }>} */
  const staged = [];
  for (const raw of complete) {
    const entry = /** @type {any} */ (raw);
    const levels = (entry.level ?? [])
      .map((/** @type {string} */ l) => /^newest-(\d)$/.exec(l))
      .filter(Boolean)
      .map((/** @type {RegExpExecArray} */ m) => Number(m[1]));
    if (levels.length === 0) continue;
    const readings = (entry.forms ?? []).map((/** @type {any} */ form) => ({
      pinyin: numberedPinyin(form.transcriptions ?? {}),
      meanings: form.meanings ?? [],
    }));
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
