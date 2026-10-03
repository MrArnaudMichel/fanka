/**
 * Maps parsed CSV/TSV columns onto `CardDraft` fields — by header text when
 * the sheet has one, otherwise by guessing from the column contents. Pure:
 * no Vue, Nuxt, Dexie or Capacitor. `validateCard` (Task 7) does the actual
 * field validation; this module only decides which column is which and
 * turns rows into drafts for it to check.
 */

import type { CardDraft, CardField } from '~core/import/validate';

export type Target = CardField | 'ignore';

export interface Mapping {
  columns: Target[];
  hasHeader: boolean;
}

/**
 * Exact, case-insensitive matches on the trimmed header cell — never a
 * substring match, so "example translation" does not collide with
 * "translation".
 */
const HEADER_SYNONYMS: Record<string, CardField> = {
  hanzi: 'hanzi',
  character: 'hanzi',
  traditional: 'hanzi',
  字: 'hanzi',
  pinyin: 'pinyin',
  zhuyin: 'zhuyin',
  bopomofo: 'zhuyin',
  注音: 'zhuyin',
  english: 'translation',
  meaning: 'translation',
  translation: 'translation',
  example: 'example',
  sentence: 'example',
  'example translation': 'exampleTranslation',
  'sentence translation': 'exampleTranslation',
  'example pinyin': 'examplePinyin',
  'sentence pinyin': 'examplePinyin',
  tags: 'tags',
};

function recogniseHeader(cell: string): CardField | null {
  return HEADER_SYNONYMS[cell.trim().toLowerCase()] ?? null;
}

const HAN_PATTERN = /\p{Script=Han}/u;
const TONE_PATTERN = /[1-5āáǎàēéěèīíǐìōóǒòūúǔùǖǘǚǜ]/;

function containsHan(value: string): boolean {
  return HAN_PATTERN.test(value);
}

/**
 * A token is a pinyin letter (Latin letters, a tone-marked vowel, ü, or `:`
 * for the `u:` umlaut spelling), then any run of letters, apostrophe
 * syllable breaks (`xi'an`), or a tone digit 1-5 not followed by another
 * digit — the lookahead is what rejects two tone digits in a row, like
 * "ni33". Starting with a letter, never a digit, is what rules out a bare
 * "3" as its own token, so "level 3 word" and "3 o'clock" fail on their
 * numeral token alone; "ni3hao3" and "Xi'an1" still match.
 *
 * Each character has exactly one way to be consumed — unlike an earlier
 * version that nested `[letters]+` inside `(...)+`, this has no repeated
 * group nested inside another repeated group, so a non-matching tail (a
 * long plain word, a URL) fails in linear time instead of backtracking
 * catastrophically: the nested form had exponentially many ways to
 * partition the same run of letters into groups, and tried them all before
 * giving up.
 */
const SYLLABLE_TOKEN_PATTERN =
  /^[a-zA-Zü:āáǎàēéěèīíǐìōóǒòūúǔùǖǘǚǜ](?:[a-zA-Zü:āáǎàēéěèīíǐìōóǒòūúǔùǖǘǚǜ']|[1-5](?![1-5]))*$/;

function isSyllableToken(token: string): boolean {
  return SYLLABLE_TOKEN_PATTERN.test(token);
}

function looksLikePinyin(value: string): boolean {
  const tokens = value.trim().split(/\s+/).filter((token) => token.length > 0);
  if (tokens.length === 0) return false;
  // A digit or tone mark anywhere in the value used to be enough — but
  // plain English like "level 3 word" has one too. Every token has to be a
  // plausible syllable run on its own, and at least one of them has to
  // actually carry a tone, which "level" and "word" do not.
  if (!tokens.every(isSyllableToken)) return false;
  return tokens.some((token) => TONE_PATTERN.test(token));
}

/** True when more than half of a column's non-empty values satisfy `predicate`. */
function isMostly(values: string[], predicate: (value: string) => boolean): boolean {
  if (values.length === 0) return false;
  const matches = values.filter(predicate).length;
  return matches / values.length > 0.5;
}

function nonEmptyValuesByColumn(rows: string[][], columnCount: number): string[][] {
  const columns: string[][] = [];
  for (let index = 0; index < columnCount; index += 1) {
    columns.push(rows.map((row) => row[index] ?? '').filter((value) => value.trim().length > 0));
  }
  return columns;
}

/**
 * No header recognised: judge each column by its non-empty values. hanzi is
 * the first column dominated by Han characters, pinyin the first remaining
 * column that both matches the pinyin character class and carries a tone
 * marker, translation the first remaining column that is mostly non-Han
 * text. Everything else is 'ignore' — tags and the example fields are never
 * guessed from content.
 */
function guessByContent(rows: string[][]): Target[] {
  const columnCount = rows.reduce((max, row) => Math.max(max, row.length), 0);
  const columns: Target[] = new Array(columnCount).fill('ignore');
  const values = nonEmptyValuesByColumn(rows, columnCount);
  const taken = new Set<number>();

  const hanziIndex = values.findIndex((column, index) => !taken.has(index) && isMostly(column, containsHan));
  if (hanziIndex >= 0) {
    columns[hanziIndex] = 'hanzi';
    taken.add(hanziIndex);
  }

  const pinyinIndex = values.findIndex(
    (column, index) => !taken.has(index) && isMostly(column, looksLikePinyin),
  );
  if (pinyinIndex >= 0) {
    columns[pinyinIndex] = 'pinyin';
    taken.add(pinyinIndex);
  }

  const translationIndex = values.findIndex(
    (column, index) => !taken.has(index) && isMostly(column, (value) => !containsHan(value)),
  );
  if (translationIndex >= 0) {
    columns[translationIndex] = 'translation';
    taken.add(translationIndex);
  }

  return columns;
}

export function guessMapping(rows: string[][]): Mapping {
  if (rows.length === 0) return { columns: [], hasHeader: false };

  const headerRow = rows[0]!;
  const recognised = headerRow.map(recogniseHeader);
  const hasHeader = recognised.some((target) => target !== null);

  if (!hasHeader) {
    return { columns: guessByContent(rows), hasHeader: false };
  }

  const taken = new Set<CardField>();
  const columns: Target[] = recognised.map((target) => {
    if (target === null || taken.has(target)) return 'ignore';
    taken.add(target);
    return target;
  });

  return { columns, hasHeader: true };
}

function buildDraft(row: string[], columns: Target[]): CardDraft {
  const fields: Partial<Record<Exclude<CardField, 'tags'>, string>> = {};
  let tags: string[] | undefined;

  columns.forEach((target, index) => {
    if (target === 'ignore') return;
    const value = row[index] ?? '';
    if (target === 'tags') {
      // Trimming is validateCard's job everywhere else; splitting tags is
      // the one exception, since the split itself introduces the stray
      // spaces (e.g. "HSK1; core").
      tags = value
        .split(/[,;]/)
        .map((tag) => tag.trim())
        .filter((tag) => tag.length > 0);
      return;
    }
    fields[target] = value;
  });

  return {
    hanzi: fields.hanzi ?? '',
    pinyin: fields.pinyin ?? '',
    translation: fields.translation ?? '',
    zhuyin: fields.zhuyin,
    example: fields.example,
    examplePinyin: fields.examplePinyin,
    exampleTranslation: fields.exampleTranslation,
    tags,
  };
}

export function applyMapping(rows: string[][], mapping: Mapping): CardDraft[] {
  const dataRows = mapping.hasHeader ? rows.slice(1) : rows;
  const mappedIndexes = mapping.columns
    .map((target, index) => ({ target, index }))
    .filter(({ target }) => target !== 'ignore')
    .map(({ index }) => index);

  const drafts: CardDraft[] = [];
  for (const row of dataRows) {
    const isBlank = mappedIndexes.every((index) => (row[index] ?? '').trim().length === 0);
    if (isBlank) continue;
    drafts.push(buildDraft(row, mapping.columns));
  }

  return drafts;
}

/**
 * What identifies "the same kind of file" for a remembered mapping: its
 * header cells, trimmed and lower-cased, in order. U+001F (unit separator)
 * joins them, since no header cell contains it.
 */
export function headerSignature(header: readonly string[]): string {
  return header.map((cell) => cell.trim().toLowerCase()).join('\u001f');
}
