import { describe, expect, it } from 'vitest';
import { guardScript } from '../../../scripts/content/lib/guard.mjs';

describe('guardScript', () => {
  it('drops a failing variant and keeps the word', () => {
    const { kept, excluded, droppedVariants } = guardScript(
      [
        { id: 'tbcl5-0001', hanzi: '羨慕', variants: ['羡慕'] },
        { id: 'tbcl5-0002', hanzi: '曬', variants: ['晒'] },
        { id: 'tbcl6-0001', hanzi: '發霉' },
      ],
      'taiwan',
    );
    expect(kept).toEqual([
      { id: 'tbcl5-0001', hanzi: '羨慕' },
      { id: 'tbcl5-0002', hanzi: '曬' },
      { id: 'tbcl6-0001', hanzi: '發霉' },
    ]);
    expect(excluded).toEqual([]);
    expect(droppedVariants).toEqual([
      { id: 'tbcl5-0001', variant: '羡慕', wrong: ['羡'] },
      { id: 'tbcl5-0002', variant: '晒', wrong: ['晒'] },
    ]);
  });

  it('excludes a word whose headword fails', () => {
    const { kept, excluded } = guardScript([{ id: 'hsk1-0001', hanzi: '學', variants: [] }], 'mainland');
    expect(kept).toEqual([]);
    expect(excluded).toEqual([{ id: 'hsk1-0001', hanzi: '學', wrong: ['學'] }]);
  });

  it('keeps the remaining variants', () => {
    const { kept } = guardScript([{ id: 'a', hanzi: '這裡', variants: ['這裏', '这里'] }], 'taiwan');
    expect(kept).toEqual([{ id: 'a', hanzi: '這裡', variants: ['這裏'] }]);
  });
});
