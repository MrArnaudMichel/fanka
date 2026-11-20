import { describe, expect, it } from 'vitest';
import { firstZhuyin, tbclWords } from '../../../scripts/content/lib/tbcl.mjs';
import { parseCedict } from '../../../scripts/content/lib/cedict.mjs';

const HEADER = ['id', 'word', 'deng', 'ji', 'situation', 'wfreq', 'sfreq', 'newlink', 'bopomofo', 'pinyin'];
const row = (
  id: number, word: string, level: number, situation: string, wfreq: number, sfreq: number, bopomofo: string,
) => [String(id), word, '基礎', `第${level}級`, situation, String(wfreq), String(sfreq), '', bopomofo, ''];

const cedict = parseCedict(
  [
    '爸爸 爸爸 [ba4 ba5] /(coll.) father/',
    '爸 爸 [ba4] /dad/',
    '好 好 [hao3] /good/',
    '好 好 [hao4] /to be fond of/',
    '愛 爱 [ai4] /to love/',
  ].join('\n'),
);

describe('tbclWords', () => {
  it('splits variants and reads the first bopomofo alternative back as pinyin', () => {
    const [word] = tbclWords([HEADER, row(1, '爸爸/爸', 1, '核心詞', 10, 10, 'ㄅㄚˋ ˙ㄅㄚ / ㄅㄚˋ')], cedict);
    expect(word).toEqual({
      id: 'tbcl1-0001',
      hanzi: '爸爸',
      variants: ['爸'],
      readings: [{ pinyin: 'ba4 ba5', zhuyin: 'ㄅㄚˋ ˙ㄅㄚ', meanings: ['(coll.) father'] }],
      level: 1,
    });
  });

  it('puts core words first, then by frequency descending, then by id', () => {
    const words = tbclWords(
      [
        HEADER,
        row(1, '好', 2, '', 100, 100, 'ㄏㄠˇ'),
        row(2, '愛', 2, '', 100, 100, 'ㄞˋ'),
        row(3, '爸', 2, '', 500, 500, 'ㄅㄚˋ'),
        row(4, '爸爸', 2, '核心詞', 1, 1, 'ㄅㄚˋ ˙ㄅㄚ'),
      ],
      cedict,
    );
    expect(words.map((w) => w.hanzi)).toEqual(['爸爸', '爸', '好', '愛']);
    expect(words.map((w) => w.id)).toEqual(['tbcl2-0001', 'tbcl2-0002', 'tbcl2-0003', 'tbcl2-0004']);
  });

  it('flags a CC-CEDICT miss with needsMeaning', () => {
    const [word] = tbclWords([HEADER, row(1, '拜拜', 1, '', 1, 1, 'ㄅㄞˋ ㄅㄞˋ')], cedict);
    expect(word?.readings[0]?.meanings).toEqual([]);
    expect(word?.needsMeaning).toBe(true);
  });

  it('falls back to tone-insensitive, then traditional-only, matching', () => {
    const [toneless] = tbclWords([HEADER, row(1, '好', 1, '', 1, 1, 'ㄏㄠ')], cedict);
    expect(toneless?.readings[0]?.meanings).toEqual(['good']);
    const [wrongReading] = tbclWords([HEADER, row(1, '愛', 1, '', 1, 1, 'ㄅㄚ')], cedict);
    expect(wrongReading?.readings[0]?.meanings).toEqual(['to love']);
  });

  it('keeps a duplicate once at its lowest level and tolerates short rows', () => {
    const short = ['9', '愛', '基礎', '第1級'];
    const words = tbclWords([HEADER, row(1, '愛', 3, '', 1, 1, 'ㄞˋ'), short.concat(['', '', '', '', 'ㄞˋ'])], cedict);
    expect(words.map((w) => [w.id, w.hanzi])).toEqual([['tbcl1-0001', '愛']]);
    const noBopomofo = tbclWords([HEADER, short], cedict);
    expect(noBopomofo).toEqual([]);
  });
});

describe('tbclWords homographs', () => {
  const longDict = parseCedict(
    ['長 长 [chang2] /long/', '長 长 [zhang3] /to grow/'].join('\n'),
  );

  it('merges numbered homographs into one word at the lower level with both readings', () => {
    const words = tbclWords(
      [HEADER, row(1, '長2', 3, '', 1, 1, 'ㄓㄤˇ'), row(2, '長1', 1, '', 1, 1, 'ㄔㄤˊ')],
      longDict,
    );
    expect(words).toEqual([
      {
        id: 'tbcl1-0001',
        hanzi: '長',
        readings: [
          { pinyin: 'chang2', zhuyin: 'ㄔㄤˊ', meanings: ['long'] },
          { pinyin: 'zhang3', zhuyin: 'ㄓㄤˇ', meanings: ['to grow'] },
        ],
        level: 1,
      },
    ]);
  });

  it('strips the digit from variants too', () => {
    const [word] = tbclWords([HEADER, row(1, '好1/好子2', 1, '', 1, 1, 'ㄏㄠˇ')], cedict);
    expect(word?.hanzi).toBe('好');
    expect(word?.variants).toEqual(['好子']);
  });
});

describe('firstZhuyin', () => {
  it.each([
    ['ㄅㄚˋ ˙ㄅㄚ / ㄅㄚˋ', 'ㄅㄚˋ ˙ㄅㄚ'],
    ['ㄏㄜˊ ˙ㄗ /', 'ㄏㄜˊ ˙ㄗ'],
    ['ㄉㄜ˙', '˙ㄉㄜ'],
    ['ㄊㄧㄥˊㄔㄜ ㄔㄤˇ', 'ㄊㄧㄥˊ ㄔㄜ ㄔㄤˇ'],
    ['ㄑㄧㄥㄈㄨˇ', 'ㄑㄧㄥ ㄈㄨˇ'],
    ['ㄇㄟˊ (ㄧㄡˇ) ㄩㄥˋ', 'ㄇㄟˊ ㄧㄡˇ ㄩㄥˋ'],
    ['(一)ㄉㄧˋ ㄉㄠˋ/(二)ㄉㄧˋ ˙ㄉㄠ', 'ㄉㄧˋ ㄉㄠˋ'],
    ['ㄆㄠˋ ㄇ一ㄢˋ', 'ㄆㄠˋ ㄇㄧㄢˋ'],
  ])('%s', (input, expected) => {
    expect(firstZhuyin(input)).toBe(expected);
  });
});
