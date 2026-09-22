/**
 * A byte-for-byte RFC 4180 reader for pasted or uploaded CSV/TSV, plus a
 * heuristic to pick which delimiter a block of text actually uses. Pure:
 * no file I/O, no Vue, no Dexie — the import screen (Task 14) owns getting
 * text into this module and cards out of it.
 */

export type Delimiter = ',' | '\t' | ';';

const BOM = '﻿';

/**
 * A single-pass character state machine, not a regex split: a regex split
 * on the delimiter or on newlines cannot tell a delimiter or a newline
 * inside a quoted field from a real one.
 */
export function parseDelimited(text: string, delimiter: Delimiter): string[][] {
  const input = text.startsWith(BOM) ? text.slice(BOM.length) : text;

  const rows: string[][] = [];
  let row: string[] = [];
  let field = '';
  let inQuotes = false;
  // True once any character has been consumed into the current field/row
  // since the last row was emitted. A line with nothing at all outside
  // quotes since then is blank and gets skipped; a line of only delimiters
  // still touches this and is kept.
  let touched = false;

  const endField = (): void => {
    row.push(field);
    field = '';
  };

  const endRow = (): void => {
    endField();
    rows.push(row);
    row = [];
    touched = false;
  };

  let i = 0;
  const length = input.length;
  while (i < length) {
    const ch = input[i]!;

    if (inQuotes) {
      if (ch === '"') {
        if (input[i + 1] === '"') {
          field += '"';
          i += 2;
          continue;
        }
        inQuotes = false;
        i += 1;
        continue;
      }
      field += ch;
      touched = true;
      i += 1;
      continue;
    }

    if (ch === '"' && field.length === 0) {
      inQuotes = true;
      touched = true;
      i += 1;
      continue;
    }

    if (ch === delimiter) {
      endField();
      touched = true;
      i += 1;
      continue;
    }

    if (ch === '\n' || ch === '\r') {
      const isCRLF = ch === '\r' && input[i + 1] === '\n';
      if (touched) endRow();
      i += isCRLF ? 2 : 1;
      continue;
    }

    field += ch;
    touched = true;
    i += 1;
  }

  // An unterminated quote just runs out of input here — the loop above is
  // bounded by `length`, so it never hangs. Whatever was read still forms
  // the final row/field.
  if (touched) endRow();

  return rows;
}

const CANDIDATE_DELIMITERS: Delimiter[] = [',', '\t', ';'];

function countOccurrences(line: string, char: string): number {
  let count = 0;
  for (const ch of line) {
    if (ch === char) count += 1;
  }
  return count;
}

/**
 * Scores a candidate delimiter over the sampled lines: disqualified (never
 * picked) if it is missing from any one of them, otherwise the negative
 * spread between its lowest and highest per-line count — 0, the best
 * possible score, when every sampled line has exactly the same count.
 */
function consistencyScore(lines: string[], delimiter: Delimiter): number {
  const counts = lines.map((line) => countOccurrences(line, delimiter));
  if (counts.some((count) => count === 0)) return -Infinity;
  return -(Math.max(...counts) - Math.min(...counts));
}

/** Picks the delimiter a pasted or uploaded block of text most likely uses. */
export function detectDelimiter(text: string): Delimiter {
  const lines = text
    .split(/\r\n|\r|\n/)
    .filter((line) => line.trim().length > 0)
    .slice(0, 5);

  if (lines.length === 0) return ',';

  let best: Delimiter = ',';
  let bestScore = -Infinity;
  for (const delimiter of CANDIDATE_DELIMITERS) {
    const score = consistencyScore(lines, delimiter);
    // Tab wins ties: a strict `>` leaves the current best in place unless a
    // later candidate is strictly better, except tab always overrides an
    // equal score even though it is checked in the middle of the list.
    if (score > bestScore || (score === bestScore && delimiter === '\t')) {
      bestScore = score;
      best = delimiter;
    }
  }

  return bestScore === -Infinity ? ',' : best;
}
