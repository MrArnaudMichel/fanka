import { describe, expect, it } from 'vitest';
import { assembleBundle } from '../../../scripts/content/assemble.mjs';

const word = (id: string, hanzi: string, meanings: string[], extra = {}) => ({
  id, hanzi, readings: [{ pinyin: 'x1', zhuyin: 'ㄒㄧ', meanings }], level: 1, ...extra,
});

describe('assembleBundle', () => {
  it('counts the examples it drops for not containing their word', () => {
    const generated = new Map([
      ['tbcl1-0001', { example: { text: '我很好。', pinyin: 'wo3 hen3 hao3', translation: 'x', segments: ['我', '很', '好', '。'] } }],
      ['tbcl1-0002', { example: { text: '你很好。', pinyin: 'ni3 hen3 hao3', translation: 'x', segments: ['你', '很', '好', '。'] } }],
    ]);
    const { droppedExamples } = assembleBundle('taiwan', [word('tbcl1-0001', '我', ['I']), word('tbcl1-0002', '他', ['he'])], generated);
    expect(droppedExamples).toBe(1);
  });

  it('cleans generated meanings and leaves out a word whose meaning fails the script check', () => {
    const generated = new Map([
      ['tbcl1-0001', { meaning: ['to bow', 'see 鞠躬|鞠躬[ju1 gong1]'] }],
      ['tbcl1-0002', { meaning: ['variant of 这'] }],
    ]);
    const { index, levelFiles, rejected } = assembleBundle(
      'taiwan',
      [word('tbcl1-0001', '鞠躬', [], { needsMeaning: true }), word('tbcl1-0002', '這', [], { needsMeaning: true })],
      generated,
    );
    const words = JSON.parse(levelFiles[0]!.json);
    expect(words.map((w: { readings: Array<{ meanings: string[] }> }) => w.readings[0]!.meanings)).toEqual([['to bow']]);
    expect(rejected).toEqual([{ id: 'tbcl1-0002', hanzi: '這', reason: 'no meaning yet' }]);
    expect(index.levels[0]?.wordCount).toBe(1);
  });
});
