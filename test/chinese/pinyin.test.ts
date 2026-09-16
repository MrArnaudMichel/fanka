import { describe, expect, it } from 'vitest';
import { parsePinyin, toDiacritic, toNumbered } from '~core/chinese/pinyin';

describe('toDiacritic', () => {
  it('marks a single vowel', () => {
    expect(toDiacritic('ma', 1)).toBe('mā');
    expect(toDiacritic('ma', 3)).toBe('mǎ');
  });

  it('leaves the neutral tone unmarked', () => {
    expect(toDiacritic('ma', 5)).toBe('ma');
  });

  it('prefers a over every other vowel', () => {
    expect(toDiacritic('hao', 3)).toBe('hǎo');
    expect(toDiacritic('xiao', 4)).toBe('xiào');
  });

  it('prefers e when there is no a', () => {
    expect(toDiacritic('xue', 2)).toBe('xué');
    expect(toDiacritic('bei', 3)).toBe('běi');
  });

  it('marks the o in ou', () => {
    expect(toDiacritic('dou', 1)).toBe('dōu');
  });

  it('marks the last vowel otherwise', () => {
    expect(toDiacritic('shui', 3)).toBe('shuǐ');
    expect(toDiacritic('niu', 2)).toBe('niú');
  });

  it('handles u-umlaut written as v or u:', () => {
    expect(toDiacritic('lv', 4)).toBe('lǜ');
    expect(toDiacritic('nu:', 3)).toBe('nǚ');
  });
});

describe('parsePinyin', () => {
  it('parses numbered input', () => {
    expect(parsePinyin('xue2 xi2')).toEqual([
      { text: 'xué', tone: 2 },
      { text: 'xí', tone: 2 },
    ]);
  });

  it('treats a missing number as the neutral tone', () => {
    expect(parsePinyin('pian2 yi')).toEqual([
      { text: 'pián', tone: 2 },
      { text: 'yi', tone: 5 },
    ]);
  });

  it('parses diacritic input and reports its tones', () => {
    expect(parsePinyin('xué xí')).toEqual([
      { text: 'xué', tone: 2 },
      { text: 'xí', tone: 2 },
    ]);
  });

  it('collapses arbitrary whitespace', () => {
    expect(parsePinyin('  wo3   men  ')).toEqual([
      { text: 'wǒ', tone: 3 },
      { text: 'men', tone: 5 },
    ]);
  });

  it('returns an empty array for empty input', () => {
    expect(parsePinyin('   ')).toEqual([]);
  });
});

describe('round trip', () => {
  it('survives numbered to diacritic and back', () => {
    const cases = ['xue2 xi2', 'hao3', 'dou1', 'shui3', 'lv4', 'ma5', 'er2'];
    for (const input of cases) {
      const parsed = parsePinyin(input);
      expect(parsePinyin(toNumbered(parsed))).toEqual(parsed);
    }
  });
});
