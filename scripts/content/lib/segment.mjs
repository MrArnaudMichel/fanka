const HAN = /\p{Script=Han}/u;

/**
 * Splits text into segments: greedy longest match over each Han run against
 * the vocabulary, an unmatched Han character on its own, and every non-Han
 * run (punctuation, spaces, digits) as one separate segment.
 * @param {string} text
 * @param {ReadonlySet<string>} vocab
 * @returns {string[]}
 */
export function segment(text, vocab) {
  const chars = [...text];
  const maxLen = Math.max(1, ...[...vocab].map((w) => [...w].length));
  /** @type {string[]} */
  const out = [];
  let i = 0;
  while (i < chars.length) {
    if (!HAN.test(chars[i])) {
      let j = i;
      while (j < chars.length && !HAN.test(chars[j])) j += 1;
      out.push(chars.slice(i, j).join(''));
      i = j;
      continue;
    }
    let runEnd = i;
    while (runEnd < chars.length && HAN.test(chars[runEnd])) runEnd += 1;
    let len = Math.min(maxLen, runEnd - i);
    for (; len > 1; len -= 1) {
      if (vocab.has(chars.slice(i, i + len).join(''))) break;
    }
    out.push(chars.slice(i, i + len).join(''));
    i += len;
  }
  return out;
}

export const isHan = (/** @type {string} */ s) => HAN.test(s);
