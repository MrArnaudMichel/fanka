import { type PinyinSyllable, type Tone } from './pinyin';

/**
 * Zhuyin is optional in Fanka, but a deck imported from a pinyin source has
 * none, and a learner in Taiwan expects it. Converting is cheaper than asking
 * every import to carry it.
 */

const INITIALS: Array<[string, string]> = [
  ['zh', 'ㄓ'], ['ch', 'ㄔ'], ['sh', 'ㄕ'],
  ['b', 'ㄅ'], ['p', 'ㄆ'], ['m', 'ㄇ'], ['f', 'ㄈ'],
  ['d', 'ㄉ'], ['t', 'ㄊ'], ['n', 'ㄋ'], ['l', 'ㄌ'],
  ['g', 'ㄍ'], ['k', 'ㄎ'], ['h', 'ㄏ'],
  ['j', 'ㄐ'], ['q', 'ㄑ'], ['x', 'ㄒ'],
  ['r', 'ㄖ'], ['z', 'ㄗ'], ['c', 'ㄘ'], ['s', 'ㄙ'],
];

const FINALS: Array<[string, string]> = [
  ['iang', 'ㄧㄤ'], ['iong', 'ㄩㄥ'], ['uang', 'ㄨㄤ'], ['ueng', 'ㄨㄥ'],
  ['ang', 'ㄤ'], ['eng', 'ㄥ'], ['ian', 'ㄧㄢ'], ['iao', 'ㄧㄠ'], ['iou', 'ㄧㄡ'],
  ['ing', 'ㄧㄥ'], ['ong', 'ㄨㄥ'], ['uai', 'ㄨㄞ'], ['uan', 'ㄨㄢ'],
  ['uei', 'ㄨㄟ'], ['uen', 'ㄨㄣ'],
  ['üan', 'ㄩㄢ'], ['üe', 'ㄩㄝ'], ['ün', 'ㄩㄣ'],
  ['ai', 'ㄞ'], ['ei', 'ㄟ'], ['ao', 'ㄠ'], ['ou', 'ㄡ'],
  ['an', 'ㄢ'], ['en', 'ㄣ'], ['er', 'ㄦ'], ['io', 'ㄧㄛ'],
  ['ia', 'ㄧㄚ'], ['ie', 'ㄧㄝ'], ['iu', 'ㄧㄡ'], ['in', 'ㄧㄣ'],
  ['ua', 'ㄨㄚ'], ['uo', 'ㄨㄛ'], ['ui', 'ㄨㄟ'], ['un', 'ㄨㄣ'],
  ['a', 'ㄚ'], ['o', 'ㄛ'], ['e', 'ㄜ'], ['i', 'ㄧ'], ['u', 'ㄨ'], ['ü', 'ㄩ'],
];

const TONE_MARKS: Record<Tone, string> = { 1: '', 2: 'ˊ', 3: 'ˇ', 4: 'ˋ', 5: '' };

/** Orthographic spellings that hide their real final. */
const REWRITES: Array<[RegExp, string]> = [
  [/^yi/, 'i'], [/^wu/, 'u'], [/^yu/, 'ü'],
  [/^y/, 'i'], [/^w/, 'u'],
  [/^([jqx])u/, '$1ü'],
];

function stripTone(text: string): string {
  return text
    .normalize('NFD')
    .replace(/[̀-̄̌]/g, '')
    .normalize('NFC');
}

/**
 * Returns null when the final has no entry in FINALS, rather than emitting
 * an initial (or a bare tone mark) with the rest of the syllable silently
 * dropped. A missing table entry must surface as a missing result, not as
 * mojibake on a learner's card.
 */
function syllableToZhuyin(syllable: PinyinSyllable): string | null {
  let bare = stripTone(syllable.text).toLowerCase();
  for (const [pattern, replacement] of REWRITES) {
    bare = bare.replace(pattern, replacement);
  }

  // The three retroflex-plus-empty-rime syllables have no separate final.
  const isEmptyRime = ['zhi', 'chi', 'shi', 'ri', 'zi', 'ci', 'si'].includes(bare);
  if (isEmptyRime) {
    bare = bare.slice(0, -1);
  }

  let out = '';
  let matchedInitial = false;
  for (const [pinyin, bopomofo] of INITIALS) {
    if (bare.startsWith(pinyin)) {
      out += bopomofo;
      bare = bare.slice(pinyin.length);
      matchedInitial = true;
      break;
    }
  }
  let matchedFinal = false;
  for (const [pinyin, bopomofo] of FINALS) {
    if (bare === pinyin) {
      out += bopomofo;
      bare = '';
      matchedFinal = true;
      break;
    }
  }

  if (bare.length > 0) {
    return null;
  }

  // A syllabic nasal (n2, ng2, hm1, ...) matches an initial and consumes the
  // whole syllable, leaving `bare` empty without ever matching a final. That
  // would otherwise slip past the guard above. The empty-rime syllables
  // (zhi, chi, ...) are the one legitimate case of an initial with no
  // separate final, already handled above.
  if (matchedInitial && !matchedFinal && !isEmptyRime) {
    return null;
  }

  const mark = TONE_MARKS[syllable.tone];
  return syllable.tone === 5 ? `˙${out}` : `${out}${mark}`;
}

export function toZhuyin(syllables: PinyinSyllable[]): string {
  const converted = syllables.map(syllableToZhuyin);
  if (converted.some((result) => result === null)) {
    return '';
  }
  return converted.join(' ');
}
