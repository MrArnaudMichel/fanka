// Shared by the HSK and TBCL normalisers: ordering, ids and duplicate removal.

/**
 * Keeps each hanzi once, at its lowest level. `words` carry a `level` and are
 * already in the order that should win ties (first seen kept).
 * @template {{ hanzi: string, level: number }} T
 * @param {T[]} words
 * @returns {T[]}
 */
export function dedupeLowestLevel(words) {
  /** @type {Map<string, T>} */
  const best = new Map();
  for (const word of words) {
    const seen = best.get(word.hanzi);
    if (!seen || word.level < seen.level) best.set(word.hanzi, word);
  }
  return words.filter((word) => best.get(word.hanzi) === word);
}

/**
 * Sorts by level (stable, so the caller's in-level order survives), then
 * assigns `<prefix><level>-<nnnn>` ids by position within the level.
 * @template {{ level: number }} T
 * @param {Array<Omit<T, 'id'>>} words
 * @param {string} prefix `hsk` or `tbcl`
 * @returns {Array<Omit<T, 'id'> & { id: string }>}
 */
export function assignIds(words, prefix) {
  const sorted = [...words].sort((a, b) => a.level - b.level);
  /** @type {Map<number, number>} */
  const counters = new Map();
  return sorted.map((word) => {
    const n = (counters.get(word.level) ?? 0) + 1;
    counters.set(word.level, n);
    return { id: `${prefix}${word.level}-${String(n).padStart(4, '0')}`, ...word };
  });
}
