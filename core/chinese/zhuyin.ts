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
  ['ang', 'ㄤ'], ['eng', 'ㄥ'], ['ian', 'ㄧㄢ'], ['iao', 'ㄧㄠ'],
  ['ing', 'ㄧㄥ'], ['ong', 'ㄨㄥ'], ['uai', 'ㄨㄞ'], ['uan', 'ㄨㄢ'],
  ['üan', 'ㄩㄢ'], ['üe', 'ㄩㄝ'], ['ün', 'ㄩㄣ'],
  ['ai', 'ㄞ'], ['ei', 'ㄟ'], ['ao', 'ㄠ'], ['ou', 'ㄡ'],
  ['an', 'ㄢ'], ['en', 'ㄣ'], ['er', 'ㄦ'],
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

function syllableToZhuyin(syllable: PinyinSyllable): string {
  let bare = stripTone(syllable.text).toLowerCase();
  for (const [pattern, replacement] of REWRITES) {
    bare = bare.replace(pattern, replacement);
  }

  // The three retroflex-plus-empty-rime syllables have no separate final.
  if (['zhi', 'chi', 'shi', 'ri', 'zi', 'ci', 'si'].includes(bare)) {
    bare = bare.slice(0, -1);
  }

  let out = '';
  for (const [pinyin, bopomofo] of INITIALS) {
    if (bare.startsWith(pinyin)) {
      out += bopomofo;
      bare = bare.slice(pinyin.length);
      break;
    }
  }
  for (const [pinyin, bopomofo] of FINALS) {
    if (bare === pinyin) {
      out += bopomofo;
      bare = '';
      break;
    }
  }

  const mark = TONE_MARKS[syllable.tone];
  return syllable.tone === 5 ? `˙${out}` : `${out}${mark}`;
}

export function toZhuyin(syllables: PinyinSyllable[]): string {
  return syllables.map(syllableToZhuyin).join(' ');
}
