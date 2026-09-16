import { describe, expect, it } from 'vitest';
import { parsePinyin } from '~core/chinese/pinyin';
import { toZhuyin } from '~core/chinese/zhuyin';

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
});
