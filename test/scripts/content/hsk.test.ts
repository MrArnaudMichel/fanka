import { describe, expect, it } from 'vitest';
import { hskWords, numberedPinyin } from '../../../scripts/content/lib/hsk.mjs';

const form = (numeric: string, meanings: string[], bopomofo = '') => ({
  traditional: 'x',
  transcriptions: { numeric, bopomofo },
  meanings,
});
const entry = (simplified: string, level: string[], frequency: number | undefined, forms: unknown[]) => ({
  simplified,
  level,
  frequency,
  pos: ['n'],
  forms,
});

describe('hskWords', () => {
  it('turns a two-form entry into one word with two readings', () => {
    const words = hskWords([entry('行', ['newest-2'], 5, [form('xing2', ['to walk']), form('hang2', ['row'])])]);
    expect(words).toHaveLength(1);
    expect(words[0]).toMatchObject({
      id: 'hsk2-0001',
      hanzi: '行',
      level: 2,
      readings: [
        { pinyin: 'xing2', meanings: ['to walk'] },
        { pinyin: 'hang2', meanings: ['row'] },
      ],
    });
  });

  it('keeps the lowest newest- level and ignores other level systems', () => {
    const words = hskWords([
      entry('好', ['new-1', 'newest-5', 'newest-2'], 1, [form('hao3', ['good'])]),
      entry('旧', ['new-3'], 2, [form('jiu4', ['old'])]),
    ]);
    expect(words.map((w) => [w.hanzi, w.level])).toEqual([['好', 2]]);
  });

  it('orders by level then frequency, missing frequency last', () => {
    const words = hskWords([
      entry('丙', ['newest-1'], undefined, [form('bing3', ['c'])]),
      entry('乙', ['newest-1'], 9, [form('yi3', ['b'])]),
      entry('甲', ['newest-1'], 2, [form('jia3', ['a'])]),
      entry('丁', ['newest-3'], 1, [form('ding1', ['d'])]),
    ]);
    expect(words.map((w) => [w.id, w.hanzi])).toEqual([
      ['hsk1-0001', '甲'],
      ['hsk1-0002', '乙'],
      ['hsk1-0003', '丙'],
      ['hsk3-0001', '丁'],
    ]);
  });

  it('keeps a duplicate once, at its lowest level', () => {
    const words = hskWords([
      entry('同', ['newest-4'], 1, [form('tong2', ['same'])]),
      entry('同', ['newest-2'], 2, [form('tong2', ['same'])]),
    ]);
    expect(words.map((w) => [w.id, w.level])).toEqual([['hsk2-0001', 2]]);
  });
});

describe('numberedPinyin', () => {
  it('lower-cases proper nouns and writes ü as v', () => {
    expect(numberedPinyin({ numeric: 'A1 la1 bo2 yu3' })).toBe('a1 la1 bo2 yu3');
    expect(numberedPinyin({ numeric: 'nü3' })).toBe('nv3');
    expect(numberedPinyin({ numeric: 'nu:3' })).toBe('nv3');
  });

  it('reads a bare syllable as neutral', () => {
    expect(numberedPinyin({ numeric: 'zhen1 de' })).toBe('zhen1 de5');
  });

  it('falls back to bopomofo when the numeric form has diacritics', () => {
    expect(numberedPinyin({ numeric: 'bu4 lìyú', bopomofo: 'ㄅㄨˋ ㄌㄧˋ ㄩˊ' })).toBe('bu4 li4 yu2');
    expect(numberedPinyin({ numeric: 'chènzhe', bopomofo: 'ㄔㄣˋ ㄓㄜ˙' })).toBe('chen4 zhe5');
  });
});
