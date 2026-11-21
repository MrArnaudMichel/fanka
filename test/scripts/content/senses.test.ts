import { describe, expect, it } from 'vitest';
import { cleanMeanings, isWeakGloss, normaliseGloss } from '../../../scripts/content/lib/senses.mjs';

describe('isWeakGloss', () => {
  it.each([
    'surname Ye',
    'variant of 个',
    'old variant of 和',
    'erhua variant of 一点',
    'used in 自个儿',
    'see 跑堂兒的',
    'abbr. for Xinjiang 新疆',
    'CL:個,件',
    'Taiwan pr. [huo4]',
    'colloquial pr. [xie3] or [xue3]',
    'unofficial variant of 瞭',
  ])('%s is weak', (gloss) => {
    expect(isWeakGloss(gloss)).toBe(true);
  });

  it.each(['also; too', 'surname and given name; full name', 'supermarket (abbr. for 超级市场)'])('%s is not', (gloss) => {
    expect(isWeakGloss(gloss)).toBe(false);
  });
});

describe('normaliseGloss', () => {
  it("keeps only the bundle's form of a CC-CEDICT reference and drops its pinyin", () => {
    expect(normaliseGloss('see 跑堂兒的|跑堂儿的[pao3 tang2 r5 de5]', 'taiwan')).toBe('see 跑堂兒的');
    expect(normaliseGloss('see 跑堂兒的|跑堂儿的[pao3 tang2 r5 de5]', 'mainland')).toBe('see 跑堂儿的');
    expect(normaliseGloss('particle similar to 啊[a5]', 'taiwan')).toBe('particle similar to 啊');
    expect(normaliseGloss('CL:個|个[ge4],件[jian4]', 'taiwan')).toBe('CL:個,件');
  });

  it('drops a Taiwan pronunciation note', () => {
    expect(normaliseGloss('(joining two nouns) and; together with; with (Taiwan pr. [han4])', 'taiwan')).toBe(
      '(joining two nouns) and; together with; with',
    );
    expect(normaliseGloss('and; with (Taiwan pr. [hàn])', 'mainland')).toBe('and; with');
    expect(normaliseGloss('(specifier) that; the; those (colloquial pr. [nei4])', 'taiwan')).toBe('(specifier) that; the; those');
    expect(normaliseGloss('comical; funny; amusing (old pr. [gu3 ji1])', 'taiwan')).toBe('comical; funny; amusing');
  });

  it('drops a gloss that is only a pronunciation note', () => {
    expect(normaliseGloss('Taiwan pr. [pang1]', 'taiwan')).toBeNull();
    expect(cleanMeanings(['used in 磅礡', 'Taiwan pr. [pang1]'], 'taiwan')).toEqual(['used in 磅礡']);
  });

  it('drops a gloss whose bare Han text is in the wrong script', () => {
    expect(normaliseGloss('variant of 跑堂儿的', 'taiwan')).toBeNull();
    expect(normaliseGloss('variant of 跑堂兒的', 'mainland')).toBeNull();
  });
});

describe('cleanMeanings', () => {
  it('drops weak glosses while another remains', () => {
    expect(cleanMeanings(['surname Ye', 'also', 'variant of 也'], 'taiwan')).toEqual(['also']);
    expect(cleanMeanings(['used in 自個兒|自个儿[zi4 ge3 r5]'], 'taiwan')).toEqual(['used in 自個兒']);
  });

  it('caps at three glosses and drops long ones, keeping at least one', () => {
    expect(cleanMeanings(['a', 'b', 'c', 'd'], 'mainland')).toEqual(['a', 'b', 'c']);
    const long = 'x'.repeat(81);
    expect(cleanMeanings([long, 'short'], 'mainland')).toEqual(['short']);
    expect(cleanMeanings([long], 'mainland')).toEqual([long]);
    expect(cleanMeanings(['classifier for birds and certain animals, one of a pair, some utensils, vessels etc'], 'mainland')).toEqual([
      'classifier for birds and certain animals, one of a pair, some utensils',
    ]);
  });

  it('dedupes and drops what fails the script check', () => {
    expect(cleanMeanings(['only', 'only', 'variant of 隻'], 'mainland')).toEqual(['only']);
    expect(cleanMeanings(['variant of 跑堂儿的'], 'taiwan')).toEqual([]);
  });
});
