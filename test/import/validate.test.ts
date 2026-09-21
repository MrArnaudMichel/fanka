import { describe, expect, it } from 'vitest';
import { validateCard } from '~core/import/validate';
import type { CardDraft } from '~core/import/validate';

const NO_EXISTING = new Set<string>();

function draft(overrides: Partial<CardDraft> = {}): CardDraft {
  return {
    hanzi: '學習',
    pinyin: 'xue2 xi2',
    translation: 'to study, to learn',
    example: '我每天學習中文。',
    examplePinyin: 'wo3 mei3 tian1 xue2 xi2 zhong1 wen2',
    exampleTranslation: 'I study Chinese every day.',
    tags: ['HSK1'],
    ...overrides,
  };
}

describe('validateCard', () => {
  it('errors on empty hanzi', () => {
    const result = validateCard(draft({ hanzi: '' }), NO_EXISTING);
    expect(result.ok).toBe(false);
    expect(result.issues).toContainEqual(
      expect.objectContaining({ field: 'hanzi', severity: 'error' }),
    );
  });

  it('errors on a simplified character in hanzi, naming it', () => {
    const result = validateCard(draft({ hanzi: '学习' }), NO_EXISTING);
    expect(result.ok).toBe(false);
    expect(result.issues).toContainEqual({
      field: 'hanzi',
      severity: 'error',
      message: 'Simplified characters: 学, 习',
    });
  });

  it('errors on a simplified character in example, naming it', () => {
    const result = validateCard(draft({ example: '我每天学习中文。' }), NO_EXISTING);
    expect(result.ok).toBe(false);
    expect(result.issues).toContainEqual({
      field: 'example',
      severity: 'error',
      message: 'Simplified characters: 学, 习',
    });
  });

  it('errors on empty translation', () => {
    const result = validateCard(draft({ translation: '' }), NO_EXISTING);
    expect(result.ok).toBe(false);
    expect(result.issues).toContainEqual(
      expect.objectContaining({ field: 'translation', severity: 'error' }),
    );
  });

  it('errors when pinyin does not parse — contains a disallowed character', () => {
    const result = validateCard(draft({ pinyin: 'xué #1' }), NO_EXISTING);
    expect(result.ok).toBe(false);
    expect(result.issues).toContainEqual(
      expect.objectContaining({ field: 'pinyin', severity: 'error' }),
    );
  });

  it('errors when pinyin is empty after trimming', () => {
    const result = validateCard(draft({ pinyin: '   ' }), NO_EXISTING);
    expect(result.ok).toBe(false);
    expect(result.issues).toContainEqual(
      expect.objectContaining({ field: 'pinyin', severity: 'error' }),
    );
  });

  it('warns, but does not error, when syllable count does not match hanzi character count', () => {
    const result = validateCard(draft({ pinyin: 'xue2' }), NO_EXISTING);
    expect(result.ok).toBe(true);
    expect(result.issues).toContainEqual(
      expect.objectContaining({ field: 'pinyin', severity: 'warning' }),
    );
  });

  it('errors when hanzi is already in the deck, with the exact duplicate message', () => {
    const result = validateCard(draft(), new Set(['學習']));
    expect(result.ok).toBe(false);
    expect(result.issues).toContainEqual({
      field: 'hanzi',
      severity: 'error',
      message: 'Already in this deck',
    });
  });

  it('raises no issue for a missing zhuyin — it is derived later', () => {
    const result = validateCard(draft({ zhuyin: undefined }), NO_EXISTING);
    expect(result.issues.some((issue) => issue.field === 'zhuyin')).toBe(false);
  });

  it('is ok, with no issues, for a valid card', () => {
    const result = validateCard(draft(), NO_EXISTING);
    expect(result.ok).toBe(true);
    expect(result.issues).toEqual([]);
  });

  it('trims surrounding whitespace before every check, including the draft it returns', () => {
    const result = validateCard(
      draft({
        hanzi: '  學習  ',
        pinyin: '  xue2 xi2  ',
        translation: '  to study, to learn  ',
        example: '  我每天學習中文。  ',
        examplePinyin: '  wo3 mei3 tian1 xue2 xi2 zhong1 wen2  ',
        exampleTranslation: '  I study Chinese every day.  ',
        tags: ['  HSK1  ', '   ', 'core'],
      }),
      new Set(['學習']),
    );
    expect(result.draft).toEqual({
      hanzi: '學習',
      pinyin: 'xue2 xi2',
      translation: 'to study, to learn',
      example: '我每天學習中文。',
      examplePinyin: 'wo3 mei3 tian1 xue2 xi2 zhong1 wen2',
      exampleTranslation: 'I study Chinese every day.',
      zhuyin: undefined,
      tags: ['HSK1', 'core'],
    });
    // The trimmed hanzi, not the padded input, is what gets matched against
    // existingHanzi.
    expect(result.issues).toContainEqual({
      field: 'hanzi',
      severity: 'error',
      message: 'Already in this deck',
    });
  });

  it('does not mutate the input draft', () => {
    const input = draft({ hanzi: '  學習  ', tags: ['  HSK1  '] });
    const snapshot = JSON.parse(JSON.stringify(input));
    validateCard(input, NO_EXISTING);
    expect(input).toEqual(snapshot);
  });
});
