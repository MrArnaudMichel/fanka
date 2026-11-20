import { describe, expect, it } from 'vitest';
import { checkExample, examplePinyin, syllabify } from '../../../scripts/content/lib/check.mjs';

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

describe('examplePinyin', () => {
  const readings: Record<string, string> = { 我: 'wo3', 想: 'xiang3', 喝: 'he1', 杯: 'bei1', 茶: 'cha2' };
  const readingOf = (w: string) => readings[w];
  it('uses the word list readings, not the model tones', () => {
    const model = ['wo5', 'xiang5', 'he5', 'bei5', 'cha5'];
    expect(examplePinyin(['我', '想', '喝', '杯', '茶', '。'], readingOf, model)).toBe('wo3 xiang3 he1 bei1 cha2');
  });
  it('falls back to model syllables for an unknown segment', () => {
    expect(examplePinyin(['我', '龘'], readingOf, ['wo5', 'da2'])).toBe('wo3 da2');
  });
  it('prefers the reading that matches the model', () => {
    const r = (w: string) => (w === '都' ? ['du1', 'dou1'] : w === '我' ? 'wo3' : undefined);
    expect(examplePinyin(['我', '都'], r, ['wo3', 'dou1'])).toBe('wo3 dou1');
    expect(examplePinyin(['我', '都'], r, ['wo3', 'dou4'])).toBe('wo3 dou1');
    expect(examplePinyin(['我', '都'], r, ['wo3', 'du5'])).toBe('wo3 du1');
    expect(examplePinyin(['我', '都'], r, ['wo3', 'xx5'])).toBe('wo3 du1');
  });
  it('uses dictionary readings for an unknown single character', () => {
    const chars = (c: string) => (c === '龘' ? ['da2', 'ta4'] : undefined);
    expect(examplePinyin(['龘'], () => undefined, ['ta5'], chars)).toBe('ta4');
    expect(examplePinyin(['龘'], () => undefined, ['da2'], chars)).toBe('da2');
    expect(examplePinyin(['龘'], () => undefined, ['zz5'], chars)).toBe('zz5');
  });
  it('keeps erhua as its own r5 syllable, one per character', () => {
    expect(examplePinyin(['一', '点', '儿'], (w) => ({ 一: 'yi1', 点: 'dian3', 儿: 'r5' })[w], ['yi1', 'dian3', 'r5'])).toBe('yi1 dian3 r5');
  });
  it('rejects a toneless multi-character fallback segment', () => {
    const r = checkExample(
      { text: '我想喝咖啡。', pinyin: 'wo xiang he ka fei', translation: 'x' },
      { hanzi: '喝' },
      new Set(['我', '想', '喝', '咖啡']),
      'mainland',
      (w) => ({ 我: 'wo3', 想: 'xiang3', 喝: 'he1' })[w],
    );
    expect((r as { reasons: string[] }).reasons).toContain('toneless pinyin');
  });
});
