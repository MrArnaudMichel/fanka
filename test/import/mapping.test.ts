import { describe, expect, it } from 'vitest';
import { applyMapping, guessMapping } from '~core/import/mapping';
import type { Mapping } from '~core/import/mapping';

describe('guessMapping', () => {
  it('recognises headers case-insensitively, in any synonym', () => {
    const rows = [['Hanzi', 'PINYIN', 'Zhuyin', 'English', 'Example', 'Tags']];
    const mapping = guessMapping(rows);
    expect(mapping).toEqual<Mapping>({
      hasHeader: true,
      columns: ['hanzi', 'pinyin', 'zhuyin', 'translation', 'example', 'tags'],
    });
  });

  it('recognises the full synonym set, including CJK header labels', () => {
    const rows = [
      [
        'character',
        'traditional',
        '字',
        'bopomofo',
        '注音',
        'meaning',
        'translation',
        'sentence',
        'sentence translation',
        'example translation',
        'sentence pinyin',
        'example pinyin',
      ],
    ];
    const mapping = guessMapping(rows);
    expect(mapping.hasHeader).toBe(true);
    // hanzi is recognised three times over ('character', 'traditional', '字');
    // only the first keeps the target, the rest fall back to 'ignore'.
    expect(mapping.columns[0]).toBe('hanzi');
    expect(mapping.columns[1]).toBe('ignore');
    expect(mapping.columns[2]).toBe('ignore');
    expect(mapping.columns[3]).toBe('zhuyin');
    expect(mapping.columns[4]).toBe('ignore');
    expect(mapping.columns[5]).toBe('translation');
    expect(mapping.columns[6]).toBe('ignore');
    expect(mapping.columns[7]).toBe('example');
    expect(mapping.columns[8]).toBe('exampleTranslation');
    expect(mapping.columns[9]).toBe('ignore');
    expect(mapping.columns[10]).toBe('examplePinyin');
    expect(mapping.columns[11]).toBe('ignore');
  });

  it('does not let "example translation" collide with "translation" — exact match, not substring', () => {
    const rows = [['example translation', 'translation']];
    const mapping = guessMapping(rows);
    expect(mapping.columns).toEqual(['exampleTranslation', 'translation']);
  });

  it('maps the first column to a target and later duplicates to ignore', () => {
    const rows = [['hanzi', 'character']];
    const mapping = guessMapping(rows);
    expect(mapping.columns).toEqual(['hanzi', 'ignore']);
  });

  it('sets hasHeader false and guesses when no header cell is recognised', () => {
    const rows = [
      ['你好', 'ni3 hao3', 'hello'],
      ['再見', 'zai4 jian4', 'goodbye'],
    ];
    const mapping = guessMapping(rows);
    expect(mapping.hasHeader).toBe(false);
    expect(mapping.columns).toEqual(['hanzi', 'pinyin', 'translation']);
  });

  it('guesses numbered-tone pinyin by content', () => {
    const rows = [
      ['你好', 'ni3 hao3', 'hello'],
      ['謝謝', 'xie4 xie5', 'thanks'],
    ];
    const mapping = guessMapping(rows);
    expect(mapping.columns[1]).toBe('pinyin');
  });

  it('guesses tone-mark pinyin by content', () => {
    const rows = [
      ['你好', 'nǐ hǎo', 'hello'],
      ['謝謝', 'xiè xie', 'thanks'],
    ];
    const mapping = guessMapping(rows);
    expect(mapping.columns[1]).toBe('pinyin');
  });

  it('does not mistake a plain English column for pinyin', () => {
    const rows = [
      ['你好', 'hello', 'greeting'],
      ['謝謝', 'thanks', 'gratitude'],
    ];
    const mapping = guessMapping(rows);
    expect(mapping.columns[1]).not.toBe('pinyin');
    expect(mapping.columns).toEqual(['hanzi', 'translation', 'ignore']);
  });

  it('ignores a column that is mostly empty', () => {
    const rows = [
      ['你好', 'ni3 hao3', 'hello', ''],
      ['再見', 'zai4 jian4', 'goodbye', ''],
    ];
    const mapping = guessMapping(rows);
    expect(mapping.columns[3]).toBe('ignore');
  });
});

describe('applyMapping', () => {
  const mapping: Mapping = {
    hasHeader: true,
    columns: ['hanzi', 'pinyin', 'translation', 'tags'],
  };

  it('skips the header row when hasHeader is true', () => {
    const rows = [
      ['hanzi', 'pinyin', 'translation', 'tags'],
      ['你好', 'ni3 hao3', 'hello', 'HSK1'],
    ];
    const drafts = applyMapping(rows, mapping);
    expect(drafts).toHaveLength(1);
    expect(drafts[0]!.hanzi).toBe('你好');
  });

  it('splits tags on ";" or ","', () => {
    const rows = [
      ['hanzi', 'pinyin', 'translation', 'tags'],
      ['你好', 'ni3 hao3', 'hello', 'HSK1; greeting,common'],
    ];
    const drafts = applyMapping(rows, mapping);
    expect(drafts[0]!.tags).toEqual(['HSK1', 'greeting', 'common']);
  });

  it('ignores columns mapped to "ignore"', () => {
    const withIgnore: Mapping = {
      hasHeader: false,
      columns: ['hanzi', 'ignore', 'pinyin', 'translation'],
    };
    const rows = [['你好', 'some note', 'ni3 hao3', 'hello']];
    const drafts = applyMapping(rows, withIgnore);
    expect(drafts[0]).toEqual({
      hanzi: '你好',
      pinyin: 'ni3 hao3',
      translation: 'hello',
      zhuyin: undefined,
      example: undefined,
      examplePinyin: undefined,
      exampleTranslation: undefined,
      tags: undefined,
    });
  });

  it('leaves an unmapped field undefined, not an empty string', () => {
    const withoutZhuyin: Mapping = {
      hasHeader: false,
      columns: ['hanzi', 'pinyin', 'translation'],
    };
    const rows = [['你好', 'ni3 hao3', 'hello']];
    const drafts = applyMapping(rows, withoutZhuyin);
    expect(drafts[0]!.zhuyin).toBeUndefined();
    expect('zhuyin' in drafts[0]!).toBe(true);
  });

  it('defaults a missing required field to an empty string rather than undefined', () => {
    const withoutHanzi: Mapping = {
      hasHeader: false,
      columns: ['ignore', 'pinyin', 'translation'],
    };
    const rows = [['note', 'ni3 hao3', 'hello']];
    const drafts = applyMapping(rows, withoutHanzi);
    expect(drafts[0]!.hanzi).toBe('');
  });

  it('skips a row that is blank after mapping', () => {
    const rows = [
      ['hanzi', 'pinyin', 'translation', 'tags'],
      ['你好', 'ni3 hao3', 'hello', ''],
      ['', '', '', ''],
      ['再見', 'zai4 jian4', 'goodbye', ''],
    ];
    const drafts = applyMapping(rows, mapping);
    expect(drafts).toHaveLength(2);
    expect(drafts.map((d) => d.hanzi)).toEqual(['你好', '再見']);
  });

  it('does not trim mapped cell values — that is validateCard’s job', () => {
    const rows = [
      ['hanzi', 'pinyin', 'translation', 'tags'],
      ['  你好  ', '  ni3 hao3  ', '  hello  ', ''],
    ];
    const drafts = applyMapping(rows, mapping);
    expect(drafts[0]!.hanzi).toBe('  你好  ');
    expect(drafts[0]!.pinyin).toBe('  ni3 hao3  ');
    expect(drafts[0]!.translation).toBe('  hello  ');
  });
});
