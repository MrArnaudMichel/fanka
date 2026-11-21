import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import path from 'node:path';
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

describe('hskWords reading order', () => {
  // Real complete.json entries (forms in CC-CEDICT order, proper nouns first).
  const common = JSON.parse(readFileSync(path.join(__dirname, 'fixtures', 'hsk-common.json'), 'utf8')) as unknown[];
  // TBCL levels of these readings, as tbclReadingLevels gives them.
  const TBCL: Record<string, Array<[string, number]>> = {
    都: [['dou1', 1]], 個: [['ge5', 1]], 和: [['han4', 1], ['he2', 1], ['huo4', 6]], 家: [['jia1', 1]],
    看: [['kan4', 1], ['kan1', 5]], 那: [['na4', 1]], 日: [['ri4', 1]], 上: [['shang4', 1]], 新: [['xin1', 1]],
    要: [['yao4', 1]], 也: [['ye3', 1]], 長: [['chang2', 1], ['zhang3', 2]], 得: [['de5', 1], ['dei3', 1], ['de2', 7]],
    讀: [['du2', 1]], 還: [['hai2', 1], ['huan2', 2]], 只: [['zhi3', 1]], 地: [['de5', 2], ['di4', 2]],
    行: [['hang2', 2], ['xing2', 2]], 隻: [['zhi1', 2]], 為: [['wei4', 4], ['wei2', 6]],
    著: [['zhu4', 6], ['zhuo2', 6], ['zhao2', 7]],
  };
  const tbclReadings = (traditional: string) => (TBCL[traditional] ?? []).map(([pinyin, level]) => ({ pinyin, level }));
  const words = hskWords(common, { tbclReadings });
  const of = (hanzi: string) => words.find((w) => w.hanzi === hanzi)!;

  it.each([
    ['个', 'ge4'], ['都', 'dou1'], ['读', 'du2'], ['也', 'ye3'], ['和', 'he2'], ['看', 'kan4'], ['要', 'yao4'],
    ['着', 'zhe5'], ['还', 'hai2'], ['那', 'na4'], ['只', 'zhi3'], ['得', 'de5'], ['地', 'de5'], ['长', 'chang2'],
    ['行', 'xing2'], ['为', 'wei4'], ['了', 'le5'], ['新', 'xin1'], ['上', 'shang4'], ['日', 'ri4'],
  ])('%s leads with %s', (hanzi, pinyin) => {
    expect(of(hanzi).readings[0]?.pinyin).toBe(pinyin);
  });

  it('merges forms that share a reading and drops reference-only senses', () => {
    expect(of('只').readings.map((r) => r.pinyin)).toEqual(['zhi3', 'zhi1']);
    expect(of('只').readings[0]?.meanings).toEqual(['only', 'merely', 'just']);
    expect(of('只').readings[1]?.meanings[0]).toMatch(/^classifier for birds/);
    expect(of('个').readings.map((r) => r.pinyin)).toEqual(['ge4']);
    expect(of('都').readings[0]?.meanings[0]).toBe('all; both; entirely');
    expect(of('也').readings[0]?.meanings[0]).toMatch(/^\(adverb\) also/);
    expect(of('家').readings[0]?.meanings).not.toContain('used in 家伙 and 家俱');
    for (const w of words) {
      expect(new Set(w.readings.map((r) => r.pinyin)).size).toBe(w.readings.length);
      for (const r of w.readings) expect(r.meanings.length).toBeLessThanOrEqual(3);
    }
  });
});
