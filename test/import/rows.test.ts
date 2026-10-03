import { describe, expect, it } from 'vitest';
import type { Card } from '~core/db/schema';
import { REPEATED_MESSAGE, sameCardContent, updatedCardFromDraft, validateImportRows } from '~core/import/rows';
import type { CardDraft } from '~core/import/validate';

const draft = (overrides: Partial<CardDraft> = {}): CardDraft => ({ hanzi: '朋友', pinyin: 'peng2 you5', translation: 'friend', ...overrides });

describe('validateImportRows', () => {
  it('marks a row already in the deck as a duplicate, not an error', () => {
    const [row] = validateImportRows([draft()], new Set(['朋友']));
    expect(row).toMatchObject({ ok: true, duplicate: true });
    expect(row!.issues.some((i) => i.severity === 'error')).toBe(false);
  });

  it('makes the second of two identical hanzi in the file an error', () => {
    const rows = validateImportRows([draft(), draft({ translation: 'pal' })], new Set(['朋友']));
    expect(rows[0]).toMatchObject({ ok: true, duplicate: true });
    expect(rows[1]).toMatchObject({ ok: false, duplicate: false });
    expect(rows[1]!.issues).toContainEqual({ field: 'hanzi', severity: 'error', message: REPEATED_MESSAGE });
  });

  it('lets a later row through when the earlier one with that hanzi had an error', () => {
    const rows = validateImportRows([draft({ translation: '' }), draft()], new Set());
    expect(rows[0]!.ok).toBe(false);
    expect(rows[1]!.ok).toBe(true);
  });

  it('keeps every other validation, such as simplified characters', () => {
    const [row] = validateImportRows([draft({ hanzi: '学习', pinyin: 'xue2 xi2' })], new Set());
    expect(row!.ok).toBe(false);
  });
});

describe('updatedCardFromDraft', () => {
  const card = {
    id: 'c1', deckId: 'd1', hanzi: '朋友', pinyin: [], zhuyin: 'ㄆㄥˊ', translation: 'old', pos: 'noun',
    example: '他是我的朋友。', examplePinyin: 'tā shì wǒ de péngyou', exampleTranslation: 'He is my friend.',
    tags: ['hsk1'], note: 'mine', createdAt: 1, updatedAt: 1, deletedAt: null,
  } as unknown as Card;

  it('overwrites content and updatedAt, keeping identity, note and creation', () => {
    const next = updatedCardFromDraft(card, draft({ translation: 'friend', tags: ['core'] }), 50);
    expect(next).toMatchObject({ id: 'c1', deckId: 'd1', hanzi: '朋友', translation: 'friend', tags: ['core'], note: 'mine', createdAt: 1, updatedAt: 50 });
    expect(next.pinyin.map((s) => s.text).join(' ')).toBe('péng you');
  });

  it('keeps example fields and tags the file did not map', () => {
    const next = updatedCardFromDraft(card, draft(), 50);
    expect(next.example).toBe('他是我的朋友。');
    expect(next.exampleTranslation).toBe('He is my friend.');
    expect(next.tags).toEqual(['hsk1']);
  });
});

describe('updatedCardFromDraft and zhuyin', () => {
  const base = {
    id: 'c1', deckId: 'd1', hanzi: '朋友', zhuyin: 'ㄆㄥˊ ㄧㄡˇ (edited)', translation: 'friend', pos: 'noun',
    example: '', examplePinyin: '', exampleTranslation: '', tags: [], note: '', createdAt: 1, updatedAt: 1, deletedAt: null,
  };

  it('keeps a hand-edited zhuyin when the file has no zhuyin and the pinyin is unchanged', () => {
    const settled = updatedCardFromDraft({ ...base, pinyin: [] } as unknown as Card, draft(), 1);
    const card = { ...base, pinyin: settled.pinyin } as unknown as Card;
    expect(updatedCardFromDraft(card, draft({ translation: 'pal' }), 2).zhuyin).toBe('ㄆㄥˊ ㄧㄡˇ (edited)');
  });

  it('derives zhuyin again when the pinyin changes', () => {
    const card = { ...base, pinyin: [] } as unknown as Card;
    expect(updatedCardFromDraft(card, draft(), 2).zhuyin).not.toBe('ㄆㄥˊ ㄧㄡˇ (edited)');
  });

  it('uses the zhuyin column when the file maps one', () => {
    const card = { ...base, pinyin: [] } as unknown as Card;
    expect(updatedCardFromDraft(card, draft({ zhuyin: 'ㄆㄥˊ ˙ㄧㄡ' }), 2).zhuyin).toBe('ㄆㄥˊ ˙ㄧㄡ');
  });
});

describe('sameCardContent', () => {
  const card = {
    id: 'c1', deckId: 'd1', hanzi: '朋友', pinyin: [], zhuyin: '', translation: 'friend', pos: 'noun',
    example: '', examplePinyin: '', exampleTranslation: '', tags: ['hsk1'], note: '', createdAt: 1, updatedAt: 1, deletedAt: null,
  } as unknown as Card;

  it('is true when re-importing the same row changes nothing the learner sees', () => {
    const same = updatedCardFromDraft(card, draft(), 50);
    const settled = { ...card, pinyin: same.pinyin, zhuyin: same.zhuyin };
    expect(sameCardContent(settled, updatedCardFromDraft(settled, draft(), 99))).toBe(true);
  });

  it('is false when a content field differs, tags included', () => {
    expect(sameCardContent(card, { ...card, translation: 'pal' })).toBe(false);
    expect(sameCardContent(card, { ...card, tags: ['hsk1', 'core'] })).toBe(false);
    expect(sameCardContent(card, { ...card, pinyin: [{ text: 'péng' }] as Card['pinyin'] })).toBe(false);
  });

  it('ignores bookkeeping: updatedAt alone is not a change', () => {
    expect(sameCardContent(card, { ...card, updatedAt: 999 })).toBe(true);
  });
});
