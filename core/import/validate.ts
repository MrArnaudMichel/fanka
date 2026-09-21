import { simplifiedCharactersIn } from '~core/chinese/script';
import { parsePinyin } from '~core/chinese/pinyin';

export type Severity = 'error' | 'warning';

export interface Issue {
  field: CardField;
  severity: Severity;
  message: string;
}

export type CardField =
  | 'hanzi'
  | 'pinyin'
  | 'zhuyin'
  | 'translation'
  | 'example'
  | 'examplePinyin'
  | 'exampleTranslation'
  | 'tags';

export interface CardDraft {
  hanzi: string;
  pinyin: string;
  zhuyin?: string;
  translation: string;
  example?: string;
  examplePinyin?: string;
  exampleTranslation?: string;
  tags?: string[];
}

export interface Validated {
  draft: CardDraft;
  issues: Issue[];
  ok: boolean;
}

/**
 * Everything `parsePinyin` accepts as a syllable's raw characters: Latin
 * letters (either case), ü, the tone-marked vowels, tone digits 1-5, `:`
 * (for the `u:` umlaut spelling), the apostrophe that separates syllables
 * like `xi'an`, and whitespace. Anything outside this set — punctuation
 * pasted in from a CSV cell, a stray CJK character — means the pinyin does
 * not parse, even though `parsePinyin` itself is lenient enough to turn any
 * token into *some* syllable.
 */
const PINYIN_PATTERN =
  /^[\sa-zA-Zü1-5:'āáǎàēéěèīíǐìōóǒòūúǔùǖǘǚǜ]+$/;

function countHanCharacters(text: string): number {
  return (text.match(/\p{Script=Han}/gu) ?? []).length;
}

function simplifiedIssue(field: CardField, text: string): Issue | null {
  const found = simplifiedCharactersIn(text);
  if (found.length === 0) return null;
  return { field, severity: 'error', message: `Simplified characters: ${found.join(', ')}` };
}

/**
 * Validates a card draft against every rule the seed, the CSV/TSV importer
 * and the card editor share. Pure: it reads nothing and writes nothing —
 * `existingHanzi` is supplied by the caller, which decides what "already in
 * this deck" means for it (the rest of a seed file being loaded, or the
 * deck a learner is importing or editing into).
 */
export function validateCard(draft: CardDraft, existingHanzi: ReadonlySet<string>): Validated {
  const trimmedTags = draft.tags?.map((tag) => tag.trim()).filter((tag) => tag.length > 0);

  const trimmed: CardDraft = {
    hanzi: draft.hanzi.trim(),
    pinyin: draft.pinyin.trim(),
    zhuyin: draft.zhuyin?.trim(),
    translation: draft.translation.trim(),
    example: draft.example?.trim(),
    examplePinyin: draft.examplePinyin?.trim(),
    exampleTranslation: draft.exampleTranslation?.trim(),
    tags: trimmedTags,
  };

  const issues: Issue[] = [];

  if (trimmed.hanzi.length === 0) {
    issues.push({ field: 'hanzi', severity: 'error', message: 'Hanzi is required' });
  } else {
    const simplified = simplifiedIssue('hanzi', trimmed.hanzi);
    if (simplified) issues.push(simplified);
    if (existingHanzi.has(trimmed.hanzi)) {
      issues.push({ field: 'hanzi', severity: 'error', message: 'Already in this deck' });
    }
  }

  if (trimmed.translation.length === 0) {
    issues.push({ field: 'translation', severity: 'error', message: 'Translation is required' });
  }

  if (!PINYIN_PATTERN.test(trimmed.pinyin)) {
    issues.push({ field: 'pinyin', severity: 'error', message: 'Pinyin does not parse' });
  }

  const hanziCount = countHanCharacters(trimmed.hanzi);
  const syllableCount = parsePinyin(trimmed.pinyin).length;
  if (hanziCount !== syllableCount) {
    issues.push({
      field: 'pinyin',
      severity: 'warning',
      message: 'Syllable count does not match hanzi character count',
    });
  }

  if (trimmed.example) {
    const simplified = simplifiedIssue('example', trimmed.example);
    if (simplified) issues.push(simplified);
  }

  const ok = issues.every((issue) => issue.severity !== 'error');
  return { draft: trimmed, issues, ok };
}
