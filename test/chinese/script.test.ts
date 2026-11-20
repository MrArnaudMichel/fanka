import { describe, expect, it } from 'vitest';
import { simplifiedCharactersIn, traditionalCharactersIn, wrongScriptCharactersIn } from '~core/chinese/script';

describe('simplifiedCharactersIn', () => {
  it('finds simplified-only characters', () => {
    expect(simplifiedCharactersIn('学习')).toEqual(['学', '习']);
  });

  it('accepts traditional text', () => {
    expect(simplifiedCharactersIn('學習時間問題電話')).toEqual([]);
  });

  it('accepts characters shared by both scripts', () => {
    expect(simplifiedCharactersIn('迎忙程人大中')).toEqual([]);
  });

  it('accepts characters that are both a simplified form and a traditional word', () => {
    // 后 empress, 干 shield, 里 village: valid traditional characters.
    expect(simplifiedCharactersIn('皇后干里')).toEqual([]);
  });

  it("accepts Taiwan's standard forms, which OpenCC's table maps to an older variant", () => {
    expect(simplifiedCharactersIn('床上')).toEqual([]);
  });

  it('reports each character once, in order of first appearance', () => {
    expect(simplifiedCharactersIn('这个这个')).toEqual(['这', '个']);
  });

  it('ignores punctuation, Latin and digits', () => {
    expect(simplifiedCharactersIn('Hello, 123。')).toEqual([]);
  });

  it('checks the whole seed deck is clean', async () => {
    const deck = (await import('~core/seed/data/hsk1.json')).default;
    for (const card of deck.cards) {
      expect(simplifiedCharactersIn(card.hanzi + card.example)).toEqual([]);
    }
  });
});

describe('traditionalCharactersIn', () => {
  it('finds characters that exist only in traditional form', () => {
    expect(traditionalCharactersIn('學習時間')).toEqual(['學', '習', '時', '間']);
  });
  it('ignores characters shared by both scripts', () => {
    expect(traditionalCharactersIn('中文人大')).toEqual([]);
  });
});

describe('wrongScriptCharactersIn', () => {
  it('flags simplified for Taiwan and traditional for Mainland', () => {
    expect(wrongScriptCharactersIn('学習', 'taiwan')).toEqual(['学']);
    expect(wrongScriptCharactersIn('学習', 'mainland')).toEqual(['習']);
  });
});
