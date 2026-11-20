import { describe, expect, it } from 'vitest';
import { checkExample, syllabify } from '../../../scripts/content/lib/check.mjs';

const allowed = new Set(['我', '的', '朋友', '很', '好', '是', '你', '他', '们', '学生', '老师', '今天', '喜欢', '都', '在', '家']);
const word = { hanzi: '朋友' };
const good = { text: '我的朋友很好。', pinyin: 'wǒ de péngyou hěn hǎo', translation: 'My friend is good.' };

describe('checkExample', () => {
  it('accepts a valid example and numbers the pinyin', () => {
    const r = checkExample(good, word, allowed, 'mainland');
    expect(r).toMatchObject({ ok: true, pinyin: 'wo3 de5 peng2 you5 hen3 hao3' });
  });
  it('rejects a sentence missing the word', () => {
    const r = checkExample({ ...good, text: '我的老师很好。', pinyin: 'wǒ de lǎo shī hěn hǎo' }, word, allowed, 'mainland');
    expect(r).toMatchObject({ ok: false });
    expect((r as { reasons: string[] }).reasons).toContain('missing word');
  });
  it('rejects a simplified character for Taiwan', () => {
    const r = checkExample({ ...good, text: '我的朋友们很好。' }, word, new Set([...allowed, '們']), 'taiwan');
    expect((r as { reasons: string[] }).reasons.some((x) => x.startsWith('wrong script'))).toBe(true);
  });
  it('rejects two unknown words', () => {
    const r = checkExample({ text: '朋友喜欢苹果香蕉。', pinyin: 'péng yǒu xǐ huan píng guǒ xiāng jiāo', translation: 'x' }, word, allowed, 'mainland');
    expect((r as { reasons: string[] }).reasons.some((x) => x.startsWith('unknown words'))).toBe(true);
  });
  it('rejects 3 characters', () => {
    const r = checkExample({ text: '好朋友', pinyin: 'hǎo péng yǒu', translation: 'x' }, word, allowed, 'mainland');
    expect((r as { reasons: string[] }).reasons).toContain('length 3');
  });
  it('rejects pinyin one syllable short', () => {
    const r = checkExample({ ...good, pinyin: 'wǒ de péngyou hěn' }, word, allowed, 'mainland');
    expect((r as { reasons: string[] }).reasons).toContain('pinyin syllable count');
  });
});

describe('syllabify', () => {
  it('splits joined syllables', () => {
    expect(syllabify('péngyou', 3)).toBeNull();
    expect(syllabify('péngyou', 2)).toBe('peng2 you5');
  });
  it('handles ü and punctuation', () => {
    expect(syllabify('nǚ, hái.', 2)).toBe('nv3 hai2');
  });
});
