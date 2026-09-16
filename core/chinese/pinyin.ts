/**
 * Pinyin in two forms: numbered (`xue2`), which is what CSV exports and
 * keyboards produce, and diacritic (`xué`), which is what a learner reads.
 * Everything stored in Fanka is diacritic plus an explicit tone number, so
 * display never has to re-derive a tone and can colour it directly.
 */

export type Tone = 1 | 2 | 3 | 4 | 5;

export interface PinyinSyllable {
  text: string;
  tone: Tone;
}

const MARKS: Record<string, string> = {
  a: 'aāáǎà',
  e: 'eēéěè',
  i: 'iīíǐì',
  o: 'oōóǒò',
  u: 'uūúǔù',
  ü: 'üǖǘǚǜ',
};

/** Reverse lookup: a marked vowel back to its plain letter and its tone. */
const UNMARK = new Map<string, { plain: string; tone: Tone }>();
for (const [plain, row] of Object.entries(MARKS)) {
  for (let tone = 1; tone <= 4; tone += 1) {
    UNMARK.set(row[tone]!, { plain, tone: tone as Tone });
  }
}

function normaliseUmlaut(syllable: string): string {
  return syllable.replace(/u:/g, 'ü').replace(/v/g, 'ü');
}

/**
 * Where the mark goes, by the standard rule: an `a` or `e` always takes it;
 * in `ou` the `o` takes it; otherwise it falls on the last vowel.
 */
function markIndex(syllable: string): number {
  const a = syllable.indexOf('a');
  if (a >= 0) return a;
  const e = syllable.indexOf('e');
  if (e >= 0) return e;
  const ou = syllable.indexOf('ou');
  if (ou >= 0) return ou;
  for (let i = syllable.length - 1; i >= 0; i -= 1) {
    if (MARKS[syllable[i]!]) return i;
  }
  return -1;
}

export function toDiacritic(syllable: string, tone: Tone): string {
  const base = normaliseUmlaut(syllable.toLowerCase());
  if (tone === 5) return base;
  const at = markIndex(base);
  if (at < 0) return base;
  const row = MARKS[base[at]!]!;
  return base.slice(0, at) + row[tone] + base.slice(at + 1);
}

/** Strips any mark, returning the plain syllable and the tone it carried. */
function fromDiacritic(syllable: string): PinyinSyllable {
  let tone: Tone = 5;
  let plain = '';
  for (const ch of syllable) {
    const hit = UNMARK.get(ch);
    if (hit) {
      tone = hit.tone;
      plain += hit.plain;
    } else {
      plain += ch;
    }
  }
  return { text: toDiacritic(plain, tone), tone };
}

export function parsePinyin(input: string): PinyinSyllable[] {
  return input
    .trim()
    .split(/\s+/)
    .filter((token) => token.length > 0)
    .map((token) => {
      const numbered = /^(.*?)([1-5])$/.exec(token);
      if (numbered) {
        const tone = Number(numbered[2]) as Tone;
        return { text: toDiacritic(numbered[1]!, tone), tone };
      }
      return fromDiacritic(normaliseUmlaut(token.toLowerCase()));
    });
}

export function toNumbered(syllables: PinyinSyllable[]): string {
  return syllables
    .map(({ text, tone }) => {
      const { text: plain } = fromDiacritic(text);
      let bare = '';
      for (const ch of plain) {
        const hit = UNMARK.get(ch);
        bare += hit ? hit.plain : ch;
      }
      return `${bare}${tone}`;
    })
    .join(' ');
}
