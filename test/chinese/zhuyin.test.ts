import { describe, expect, it } from 'vitest';
import { parsePinyin, toDiacritic, toNumbered } from '~core/chinese/pinyin';
import { ZHUYIN_SYLLABLES, fromZhuyin, toZhuyin } from '~core/chinese/zhuyin';

describe('toZhuyin', () => {
  it('converts a two-syllable word', () => {
    expect(toZhuyin(parsePinyin('xue2 xi2'))).toBe('ㄒㄩㄝˊ ㄒㄧˊ');
  });

  it('leaves the first tone unmarked', () => {
    expect(toZhuyin(parsePinyin('can1 ting1'))).toBe('ㄘㄢ ㄊㄧㄥ');
  });

  it('marks the neutral tone with a leading dot', () => {
    expect(toZhuyin(parsePinyin('ma5'))).toBe('˙ㄇㄚ');
  });

  it('handles a zero-initial syllable', () => {
    expect(toZhuyin(parsePinyin('wo3'))).toBe('ㄨㄛˇ');
  });

  it('returns an empty string for no syllables', () => {
    expect(toZhuyin([])).toBe('');
  });

  it('handles the zero-initial "wei" spelling, not just its post-consonant reduction "ui"', () => {
    expect(toZhuyin(parsePinyin('wei4'))).toBe('ㄨㄟˋ');
  });

  it('handles the zero-initial "wen" spelling, not just its post-consonant reduction "un"', () => {
    expect(toZhuyin(parsePinyin('wen2'))).toBe('ㄨㄣˊ');
  });

  it('handles the zero-initial "you" spelling, not just its post-consonant reduction "iu"', () => {
    expect(toZhuyin(parsePinyin('you3'))).toBe('ㄧㄡˇ');
  });

  it('returns an empty string for the whole input, rather than a bare tone mark, when a syllable\'s final has no table entry', () => {
    expect(toZhuyin(parsePinyin('bue1'))).toBe('');
  });

  it('returns an empty string for the syllabic nasal "n", rather than just its initial, when it has no final', () => {
    expect(toZhuyin(parsePinyin('n2'))).toBe('');
  });

  it('returns an empty string for the syllabic nasal "ng", rather than just its initial, when it has no final', () => {
    expect(toZhuyin(parsePinyin('ng2'))).toBe('');
  });

  it('returns an empty string for the syllabic nasal "hm", rather than just its initial, when it has no final', () => {
    expect(toZhuyin(parsePinyin('hm1'))).toBe('');
  });
});

describe('fromZhuyin', () => {
  it('reads zhuyin back as numbered pinyin', () => {
    expect(toNumbered(fromZhuyin('ㄅㄚˋ ˙ㄅㄚ'))).toBe('ba4 ba5');
    expect(toNumbered(fromZhuyin('ㄞˋ'))).toBe('ai4');
    expect(toNumbered(fromZhuyin('ㄗㄨㄛˋ ㄗ'))).toBe('zuo4 zi1');
    // toNumbered writes ü as v, so this is the existing convention for nü3.
    expect(toNumbered(fromZhuyin('ㄋㄩˇ'))).toBe('nv3');
    expect(fromZhuyin('ㄋㄩˇ')[0]!.text).toBe('nǚ');
  });

  it('round-trips every syllable toZhuyin knows', () => {
    expect(ZHUYIN_SYLLABLES.size).toBeGreaterThan(300);
    for (const pinyin of ZHUYIN_SYLLABLES.values()) {
      for (const tone of [1, 2, 3, 4, 5] as const) {
        const syllable = { text: toDiacritic(pinyin, tone), tone };
        expect(fromZhuyin(toZhuyin([syllable]))).toEqual([syllable]);
      }
    }
  });

  it('names an unknown syllable', () => {
    expect(() => fromZhuyin('ㄅㄅ')).toThrow(/ㄅㄅ/);
  });
});
