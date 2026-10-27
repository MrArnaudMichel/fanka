import { describe, expect, it } from 'vitest';
import { buildDrill, DRILL_CHOICES, type DrillCard } from '~core/translation/drill';

function seeded(seed: number): () => number {
  let s = seed;
  return () => {
    s = (s * 1103515245 + 12345) % 2 ** 31;
    return s / 2 ** 31;
  };
}

const card = (id: string, hanzi: string, translation: string): DrillCard => ({ id, hanzi, pinyin: '', translation });
const CARDS = [
  card('1', '貓', 'cat'),
  card('2', '狗', 'dog'),
  card('3', '書', 'book'),
  card('4', '桌子', 'table'),
  card('5', '椅子', 'chair'),
  card('6', '房間', 'room'),
];

describe('buildDrill', () => {
  it('asks as many questions as asked for, each card once before any repeat', () => {
    const drill = buildDrill(CARDS, CARDS, { directions: ['meaning'], length: 6 }, seeded(1));
    expect(drill).toHaveLength(6);
    expect(new Set(drill.map((q) => q.cardId)).size).toBe(6);
    expect(buildDrill(CARDS, CARDS, { directions: ['meaning'], length: 9 }, seeded(2))).toHaveLength(9);
  });

  it('asks the meaning of a hanzi', () => {
    const [q] = buildDrill([CARDS[0]!], CARDS, { directions: ['meaning'], length: 1 }, seeded(3));
    expect(q!.prompt).toBe('貓');
    expect(q!.choices[q!.answer]).toBe('cat');
    expect(q!.choices).toHaveLength(DRILL_CHOICES);
  });

  it('asks the hanzi for a meaning', () => {
    const [q] = buildDrill([CARDS[1]!], CARDS, { directions: ['hanzi'], length: 1 }, seeded(4));
    expect(q!.prompt).toBe('dog');
    expect(q!.choices[q!.answer]).toBe('狗');
  });

  it('never offers the same choice twice, even when cards share a meaning', () => {
    const pool = [...CARDS, card('7', '小貓', 'cat')];
    for (let seed = 1; seed <= 30; seed += 1) {
      for (const q of buildDrill(pool, pool, { directions: ['meaning', 'hanzi'], length: 10 }, seeded(seed))) {
        expect(new Set(q.choices).size).toBe(q.choices.length);
        expect(q.choices.filter((c) => c === q.choices[q.answer])).toHaveLength(1);
      }
    }
  });

  it('offers fewer choices when the pool is small', () => {
    const two = CARDS.slice(0, 2);
    const [q] = buildDrill(two, two, { directions: ['meaning'], length: 1 }, seeded(5));
    expect(q!.choices).toHaveLength(2);
  });

  it('is empty when nothing can be asked', () => {
    expect(buildDrill([CARDS[0]!], [CARDS[0]!], { directions: ['meaning'], length: 3 })).toEqual([]);
    expect(buildDrill(CARDS, CARDS, { directions: [], length: 3 })).toEqual([]);
  });
});
