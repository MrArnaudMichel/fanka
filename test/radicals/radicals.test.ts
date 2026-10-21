import { describe, expect, it } from 'vitest';
import { simplifiedCharactersIn } from '~core/chinese/script';
import { PINYIN_PATTERN } from '~core/import/validate';
import { findRadical, matchesQuery, RADICAL_GROUPS, RADICALS, radicalForms, radicalId, variantText } from '~core/radicals';

describe('radicals data', () => {
  it('is traditional only', () => {
    const text = RADICALS.flatMap((r) => [...radicalForms(r), ...r.examples.map((e) => e.hanzi)]).join('');
    expect(simplifiedCharactersIn(text)).toEqual([]);
  });

  it('numbers each radical once, within the Kangxi range', () => {
    const numbers = RADICALS.map((r) => r.number);
    expect(new Set(numbers).size).toBe(numbers.length);
    expect(numbers.every((n) => n >= 1 && n <= 214)).toBe(true);
  });

  it('files each example character under one radical only', () => {
    const examples = RADICALS.flatMap((r) => r.examples.map((e) => e.hanzi));
    expect(new Set(examples).size).toBe(examples.length);
  });

  it('gives every radical readable pinyin, a meaning and at least two examples', () => {
    for (const r of RADICALS) {
      expect(PINYIN_PATTERN.test(r.pinyin), r.radical).toBe(true);
      expect(r.meaning.trim(), r.radical).not.toBe('');
      expect(r.examples.length, r.radical).toBeGreaterThanOrEqual(2);
      for (const e of r.examples) expect(PINYIN_PATTERN.test(e.pinyin), e.hanzi).toBe(true);
    }
  });

  it('gives each meaning once, so a meaning question has one right answer', () => {
    const meanings = RADICALS.map((r) => r.meaning);
    expect(new Set(meanings).size).toBe(meanings.length);
  });

  it('puts every radical in a known group', () => {
    const ids = new Set(RADICAL_GROUPS.map((g) => g.id));
    expect(RADICALS.every((r) => ids.has(r.group))).toBe(true);
  });
});

describe('radical helpers', () => {
  const person = findRadical('kangxi-9')!;

  it('finds a radical by id', () => {
    expect(person.radical).toBe('人');
    expect(radicalId(person)).toBe('kangxi-9');
    expect(findRadical('kangxi-999')).toBeUndefined();
  });

  it('lists the full form first, then its variants', () => {
    expect(radicalForms(person)).toEqual(['人', '亻']);
  });

  it('describes where each variant sits', () => {
    expect(variantText(person)).toBe('Written 亻 on the left');
    expect(variantText(findRadical('kangxi-1')!)).toBe('');
  });

  it('matches on forms, toneless pinyin, meanings and examples', () => {
    const water = findRadical('kangxi-85')!;
    expect(matchesQuery(water, '氵')).toBe(true);
    expect(matchesQuery(water, 'shui')).toBe(true);
    expect(matchesQuery(water, 'WATER')).toBe(true);
    expect(matchesQuery(water, '海')).toBe(true);
    expect(matchesQuery(water, 'fire')).toBe(false);
    expect(matchesQuery(water, '  ')).toBe(true);
  });
});
