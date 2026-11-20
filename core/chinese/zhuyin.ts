import { type PinyinSyllable, type Tone, toDiacritic } from './pinyin';

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

/** Tone marks written after the syllable; the neutral tone is a prefix dot. */
const MARK_TONES: Record<string, Tone> = { 'ˊ': 2, 'ˇ': 3, 'ˋ': 4 };

/** Finals as pinyin spells them after an initial, then with no initial. */
const FINAL_SPELLINGS: Array<{ withInitial: string; bare: string }> = [
  { withInitial: 'a', bare: 'a' }, { withInitial: 'o', bare: 'o' },
  { withInitial: 'e', bare: 'e' }, { withInitial: 'ai', bare: 'ai' },
  { withInitial: 'ei', bare: 'ei' }, { withInitial: 'ao', bare: 'ao' },
  { withInitial: 'ou', bare: 'ou' }, { withInitial: 'an', bare: 'an' },
  { withInitial: 'en', bare: 'en' }, { withInitial: 'ang', bare: 'ang' },
  { withInitial: 'eng', bare: 'eng' }, { withInitial: 'er', bare: 'er' },
  { withInitial: 'i', bare: 'yi' }, { withInitial: 'ia', bare: 'ya' },
  { withInitial: 'ie', bare: 'ye' }, { withInitial: 'io', bare: 'yo' },
  { withInitial: 'iao', bare: 'yao' }, { withInitial: 'iu', bare: 'you' },
  { withInitial: 'ian', bare: 'yan' }, { withInitial: 'in', bare: 'yin' },
  { withInitial: 'iang', bare: 'yang' }, { withInitial: 'ing', bare: 'ying' },
  { withInitial: 'iong', bare: 'yong' },
  { withInitial: 'u', bare: 'wu' }, { withInitial: 'ua', bare: 'wa' },
  { withInitial: 'uo', bare: 'wo' }, { withInitial: 'uai', bare: 'wai' },
  { withInitial: 'ui', bare: 'wei' }, { withInitial: 'uan', bare: 'wan' },
  { withInitial: 'un', bare: 'wen' }, { withInitial: 'uang', bare: 'wang' },
  { withInitial: 'ong', bare: 'weng' },
  { withInitial: 'ü', bare: 'yu' }, { withInitial: 'üe', bare: 'yue' },
  { withInitial: 'üan', bare: 'yuan' }, { withInitial: 'ün', bare: 'yun' },
];

/**
 * Every pinyin syllable (tone-free, canonical spelling) keyed by its
 * tone-free zhuyin. Built by running the forward converter over candidate
 * spellings, so the two directions cannot drift apart. Combinations that are
 * not real syllables are harmless: they only matter if someone types them.
 */
export const ZHUYIN_SYLLABLES: ReadonlyMap<string, string> = (() => {
  const map = new Map<string, string>();
  const add = (pinyin: string) => {
    const zhuyin = toZhuyin([{ text: pinyin, tone: 1 }]);
    if (zhuyin !== '' && !map.has(zhuyin)) map.set(zhuyin, pinyin);
  };
  for (const { bare } of FINAL_SPELLINGS) add(bare);
  for (const [initial] of INITIALS) {
    const empty = ['zh', 'ch', 'sh', 'r', 'z', 'c', 's'].includes(initial);
    if (empty) add(`${initial}i`);
    for (const { withInitial } of FINAL_SPELLINGS) {
      if (withInitial === 'er') continue;
      let final = withInitial;
      if (empty && final.startsWith('i')) continue;
      if ('jqx'.includes(initial) && final.startsWith('ü')) final = final.replace('ü', 'u');
      else if (!'jqx'.includes(initial) && final.startsWith('ü') && !'nl'.includes(initial)) continue;
      add(`${initial}${final}`);
    }
  }
  return map;
})();

/** Reads zhuyin (syllables separated by spaces) back as pinyin syllables. */
export function fromZhuyin(zhuyin: string): PinyinSyllable[] {
  return zhuyin
    .trim()
    .split(/\s+/)
    .filter((token) => token.length > 0)
    .map((token) => {
      let body = token;
      let tone: Tone = 1;
      if (body.startsWith('˙')) {
        tone = 5;
        body = body.slice(1);
      } else {
        const last = body.slice(-1);
        const marked = MARK_TONES[last];
        if (marked) {
          tone = marked;
          body = body.slice(0, -1);
        }
      }
      const pinyin = ZHUYIN_SYLLABLES.get(body);
      if (pinyin === undefined) {
        throw new Error(`Unknown zhuyin syllable: ${token}`);
      }
      return { text: toDiacritic(pinyin, tone), tone };
    });
}
