import { describe, expect, it } from 'vitest';
import type { Card } from '~core/db/schema';
import { REPEATED_MESSAGE, updatedCardFromDraft, validateImportRows } from '~core/import/rows';
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
