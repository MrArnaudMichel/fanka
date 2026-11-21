import { describe, expect, it } from 'vitest';
import { firstZhuyin, tbclReadingLevels, tbclWords } from '../../../scripts/content/lib/tbcl.mjs';
import { syllableMismatches } from '../../../scripts/content/lib/order.mjs';
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
    expect(toneless?.readings[0]?.meanings).toEqual(['good', 'to be fond of']);
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

describe('tbclWords senses', () => {
  const dict = parseCedict(
    [
      '也 也 [Ye3] /surname Ye/',
      '也 也 [ye3] /also; too; as well/(literary) particle having functions similar to 啊[a5]/',
      '年 年 [Nian2] /surname Nian/',
      '年 年 [nian2] /year/CL:個|个[ge4]/',
      '錢 钱 [Qian2] /surname Qian/',
      '錢 钱 [qian2] /coin/money/CL:筆|笔[bi3]/',
      '和 和 [He2] /surname He/',
      '和 和 [he2] /(joining two nouns) and; together with; with (Taiwan pr. [han4])/(math.) sum/to make peace/(sports) to draw; to tie/',
      '和 和 [hu2] /to complete a set in mahjong or playing cards/',
      '個 个 [ge3] /used in 自個兒|自个儿[zi4 ge3 r5]/',
      '個 个 [ge4] /(classifier used before a noun that has no specific classifier)/(bound form) individual/',
      '告訴 告诉 [gao4 su4] /to press charges; to file a complaint/',
      '告訴 告诉 [gao4 su5] /to tell; to inform; to let know/',
      '這裡 这里 [zhe4 li3] /here/',
      '大夫 大夫 [da4 fu1] /senior official (in imperial China)/',
      '大夫 大夫 [dai4 fu5] /doctor; physician/',
      '橘子 橘子 [ju2 zi5] /tangerine/',
      '曬 晒 [shai4] /to dry in the sun/',
    ].join('\n'),
  );
  const one = (word: string, bopomofo: string) => tbclWords([HEADER, row(1, word, 1, '核心詞', 1, 1, bopomofo)], dict)[0];
  const first = (word: string, bopomofo: string) => one(word, bopomofo)?.readings[0]?.meanings[0];

  it.each([
    ['也', 'ㄧㄝˇ', 'also; too; as well'],
    ['年', 'ㄋㄧㄢˊ', 'year'],
    ['錢', 'ㄑㄧㄢˊ', 'coin'],
    ['個', '˙ㄍㄜ', '(classifier used before a noun that has no specific classifier)'],
    ['告訴', 'ㄍㄠˋ ㄙㄨˋ', 'to tell; to inform; to let know'],
  ])('%s leads with its common sense', (word, bopomofo, meaning) => {
    expect(first(word, bopomofo)).toBe(meaning);
  });

  it('drops surname and classifier glosses and cross-reference pinyin', () => {
    expect(one('年', 'ㄋㄧㄢˊ')?.readings[0]?.meanings).toEqual(['year']);
    expect(one('也', 'ㄧㄝˇ')?.readings[0]?.meanings).toEqual(['also; too; as well', '(literary) particle having functions similar to 啊']);
  });

  it('keeps every reading of a single-form row, each with its meanings', () => {
    expect(one('和1', 'ㄏㄢˋ / ㄏㄜˊ')?.readings).toEqual([
      { pinyin: 'han4', zhuyin: 'ㄏㄢˋ', meanings: ['(joining two nouns) and; together with; with', '(math.) sum', 'to make peace'] },
      { pinyin: 'he2', zhuyin: 'ㄏㄜˊ', meanings: ['(joining two nouns) and; together with; with', '(math.) sum', 'to make peace'] },
    ]);
    expect(one('大夫', 'ㄉㄚˋ ㄈㄨ / ㄉㄞˋ ˙ㄈㄨ')?.readings.map((r) => [r.pinyin, r.meanings[0]])).toEqual([
      ['da4 fu1', 'senior official (in imperial China)'],
      ['dai4 fu5', 'doctor; physician'],
    ]);
  });

  it('gives the headword the alternative with one syllable per character', () => {
    expect(one('這裡/這裏/這兒', 'ㄓㄜˋ/ㄓㄜˋ ㄌㄧˇ/ㄓㄜˋ ㄦ')?.readings).toEqual([
      { pinyin: 'zhe4 li3', zhuyin: 'ㄓㄜˋ ㄌㄧˇ', meanings: ['here'] },
    ]);
  });

  it('corrects known source errors', () => {
    expect(one('橘子', 'ㄐㄩˊ')?.readings).toEqual([{ pinyin: 'ju2 zi5', zhuyin: 'ㄐㄩˊ ˙ㄗ', meanings: ['tangerine'] }]);
    expect(one('有助（於）', 'ㄧㄡˇ ㄓㄨˋ')?.readings[0]?.pinyin).toBe('you3 zhu4 yu2');
    // 晒 is the simplified form; Taiwan writes 曬, so it leads.
    expect(one('晒/曬', 'ㄕㄞˋ')).toMatchObject({ hanzi: '曬', variants: ['晒'] });
  });
});

describe('syllableMismatches', () => {
  it('lists readings whose syllable count differs from the Han characters', () => {
    expect(
      syllableMismatches([
        { id: 'a', hanzi: '這裡', readings: [{ pinyin: 'zhe4' }] },
        { id: 'b', hanzi: '沒(有)用', readings: [{ pinyin: 'mei2 you3 yong4' }] },
        { id: 'c', hanzi: '這兒', readings: [{ pinyin: 'zhe4 r5' }] },
      ]),
    ).toEqual(['a 這裡 zhe4']);
  });
});

describe('tbclWords homograph senses', () => {
  it("does not give a full-tone homograph its neutral-tone sibling's sense", () => {
    const dict = parseCedict(['得 得 [de2] /to obtain/', '得 得 [de5] /structural particle/'].join('\n'));
    const [word] = tbclWords([HEADER, row(1, '得2', 1, '', 1, 1, '˙ㄉㄜ'), row(2, '得3', 7, '', 1, 1, 'ㄉㄜˊ')], dict);
    expect(word?.readings.map((r) => [r.pinyin, r.meanings[0]])).toEqual([
      ['de5', 'structural particle'],
      ['de2', 'to obtain'],
    ]);
  });
});

describe('tbclReadingLevels', () => {
  it('lists each reading of a headword with the level of its row', () => {
    const levels = tbclReadingLevels([HEADER, row(1, '長2', 2, '', 1, 1, 'ㄓㄤˇ'), row(2, '長1', 1, '', 1, 1, 'ㄔㄤˊ'), row(3, '和1', 1, '', 1, 1, 'ㄏㄢˋ / ㄏㄜˊ')]);
    expect(levels('長')).toEqual([{ pinyin: 'zhang3', level: 2 }, { pinyin: 'chang2', level: 1 }]);
    expect(levels('和')).toEqual([{ pinyin: 'han4', level: 1 }, { pinyin: 'he2', level: 1 }]);
    expect(levels('無')).toEqual([]);
  });
});
