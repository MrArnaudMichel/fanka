import { describe, expect, it } from 'vitest';
import { detectDelimiter, parseDelimited } from '~core/import/parse';

describe('parseDelimited', () => {
  it('parses plain rows', () => {
    expect(parseDelimited('a,b,c\nd,e,f', ',')).toEqual([
      ['a', 'b', 'c'],
      ['d', 'e', 'f'],
    ]);
  });

  it('parses the last line the same with or without a trailing newline', () => {
    expect(parseDelimited('a,b\nc,d', ',')).toEqual([
      ['a', 'b'],
      ['c', 'd'],
    ]);
    expect(parseDelimited('a,b\nc,d\n', ',')).toEqual([
      ['a', 'b'],
      ['c', 'd'],
    ]);
  });

  it('keeps a delimiter inside a quoted field', () => {
    expect(parseDelimited('"a,b",c', ',')).toEqual([['a,b', 'c']]);
  });

  it('keeps a newline inside a quoted field', () => {
    expect(parseDelimited('"a\nb",c', ',')).toEqual([['a\nb', 'c']]);
  });

  it('unescapes a doubled quote to a single quote', () => {
    expect(parseDelimited('"a""b",c', ',')).toEqual([['a"b', 'c']]);
  });

  it('treats CRLF and LF as equivalent row separators', () => {
    expect(parseDelimited('a,b\r\nc,d\ne,f', ',')).toEqual([
      ['a', 'b'],
      ['c', 'd'],
      ['e', 'f'],
    ]);
  });

  it('strips a leading UTF-8 BOM', () => {
    expect(parseDelimited('﻿a,b\nc,d', ',')).toEqual([
      ['a', 'b'],
      ['c', 'd'],
    ]);
  });

  it('preserves empty fields', () => {
    expect(parseDelimited('a,,c', ',')).toEqual([['a', '', 'c']]);
  });

  it('skips blank lines', () => {
    expect(parseDelimited('a,b\n\nc,d', ',')).toEqual([
      ['a', 'b'],
      ['c', 'd'],
    ]);
  });

  it('keeps a row of only delimiters', () => {
    expect(parseDelimited(',,', ',')).toEqual([['', '', '']]);
  });

  it('parses TSV with a tab delimiter', () => {
    expect(parseDelimited('a\tb\tc\nd\te\tf', '\t')).toEqual([
      ['a', 'b', 'c'],
      ['d', 'e', 'f'],
    ]);
  });

  it('does not hang on an unterminated quote, consuming to end of input', () => {
    expect(parseDelimited('"abc', ',')).toEqual([['abc']]);
  });

  it('does not hang on an unterminated quote followed by more rows worth of text', () => {
    expect(parseDelimited('a,"b\nc,d', ',')).toEqual([['a', 'b\nc,d']]);
  });
});

describe('detectDelimiter', () => {
  it('picks the tab for a pasted spreadsheet block', () => {
    const text = 'hanzi\tpinyin\ttranslation\n你好\tni3 hao3\thello\n再見\tzai4 jian4\tbye';
    expect(detectDelimiter(text)).toBe('\t');
  });

  it('picks the comma for a comma CSV', () => {
    const text = 'hanzi,pinyin,translation\n你好,ni3 hao3,hello\n再見,zai4 jian4,bye';
    expect(detectDelimiter(text)).toBe(',');
  });

  it('picks the semicolon for a semicolon CSV (European locales)', () => {
    const text = 'hanzi;pinyin;translation\n你好;ni3 hao3;hello\n再見;zai4 jian4;bye';
    expect(detectDelimiter(text)).toBe(';');
  });

  it('defaults to comma for a single column with no delimiter at all', () => {
    const text = '你好\n再見\n謝謝';
    expect(detectDelimiter(text)).toBe(',');
  });

  it('prefers tab when tab and another delimiter are equally consistent', () => {
    // Every line has exactly one tab and exactly one comma inside a cell value.
    const text = 'a,1\tb\nc,2\td';
    expect(detectDelimiter(text)).toBe('\t');
  });
});
