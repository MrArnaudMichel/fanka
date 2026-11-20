import { describe, expect, it } from 'vitest';
import { buildExercises, seededRng } from '../../core/curriculum/exercises';
import type { Word } from '../../core/curriculum/types';

const TONES = ['ba1', 'ba2', 'ba3', 'ba4', 'ba5'];
const make = (i: number, withExample: boolean): Word => ({
  id: `w${i}`,
  hanzi: String.fromCodePoint(0x4e00 + i),
  readings: [{ pinyin: `${TONES[i % 5]!.slice(0, 2)}${(i % 4) + 1} ma${(i % 4) + 1}`, meanings: [`meaning ${i}`] }],
  level: 1,
  lesson: 'l1',
  ...(withExample
    ? {
        example: {
          text: `我${String.fromCodePoint(0x4e00 + i)}你`,
          pinyin: 'x',
          translation: `sentence ${i}`,
          segments: ['我', String.fromCodePoint(0x4e00 + i), '你'],
        },
      }
    : {}),
});

const level = Array.from({ length: 40 }, (_, i) => make(i, i % 2 === 0));
const lesson = level.slice(0, 10);
const opts = { listening: true, writing: true };

describe('seededRng', () => {
  it('is deterministic per seed and in [0, 1)', () => {
    const a = seededRng('x');
    const b = seededRng('x');
    const values = [a(), a(), a()];
    expect(values).toEqual([b(), b(), b()]);
    expect(values.every((v) => v >= 0 && v < 1)).toBe(true);
    expect(seededRng('y')()).not.toBe(values[0]);
  });
});

describe('buildExercises', () => {
  const build = (seed: string, o = opts, words = lesson) =>
    buildExercises(words, level, seededRng(seed), o);

  it('builds 12 for ten words, every word present', () => {
    const exercises = build('x');
    expect(exercises).toHaveLength(12);
    expect(new Set(exercises.map((e) => e.wordId))).toEqual(new Set(lesson.map((w) => w.id)));
  });

  it('is deterministic', () => {
    expect(build('x')).toEqual(build('x'));
  });

  it('never repeats a choice or lacks the answer', () => {
    for (const seed of ['a', 'b', 'c', 'd', 'e']) {
      for (const e of build(seed)) {
        if (!e.choices || e.kind === 'order') continue;
        expect(new Set(e.choices).size).toBe(e.choices.length);
        expect(e.choices).toContain(e.answer);
        expect(e.choices).toHaveLength(4);
      }
    }
  });

  it('only uses cloze and order for words with an example', () => {
    const byId = new Map(level.map((w) => [w.id, w]));
    for (const seed of ['a', 'b', 'c', 'd', 'e', 'f']) {
      for (const e of build(seed)) {
        if (e.kind === 'cloze' || e.kind === 'order') expect(byId.get(e.wordId)?.example).toBeDefined();
      }
    }
  });

  it('blanks the word in a cloze prompt', () => {
    const cloze = [...'abcdefgh'].flatMap((s) => build(s)).find((e) => e.kind === 'cloze')!;
    expect(cloze.prompt).toContain('＿');
    expect(cloze.prompt).not.toContain(cloze.answer as string);
  });

  it('has at most one writing exercise, none when off', () => {
    for (const seed of ['a', 'b', 'c']) {
      expect(build(seed).filter((e) => e.kind === 'writing')).toHaveLength(1);
      expect(build(seed, { listening: true, writing: false }).some((e) => e.kind === 'writing')).toBe(false);
    }
  });

  it('leaves out listening when off', () => {
    expect(build('a', { listening: false, writing: true }).some((e) => e.kind === 'listening')).toBe(false);
  });

  it('never repeats a kind three times in a row', () => {
    for (const seed of ['a', 'b', 'c', 'd', 'e', 'f', 'g', 'h']) {
      const kinds = build(seed, { listening: false, writing: false }).map((e) => e.kind);
      kinds.forEach((k, i) => {
        if (i >= 2) expect(!(kinds[i - 1] === k && kinds[i - 2] === k)).toBe(true);
      });
    }
  });

  it('changes the first syllable tone in reading choices', () => {
    const reading = [...'abcdefgh'].flatMap((s) => build(s)).find((e) => e.kind === 'reading')!;
    const answer = reading.answer as string;
    const tail = answer.split(' ').slice(1).join(' ');
    for (const choice of reading.choices!) {
      expect(choice.split(' ').slice(1).join(' ')).toBe(tail);
    }
    expect(reading.choices).toHaveLength(4);
  });

  it('puts the translation segments in order as the answer', () => {
    const order = [...'abcdefgh'].flatMap((s) => build(s)).find((e) => e.kind === 'order')!;
    expect(order.answer).toHaveLength(3);
    expect([...order.choices!].sort()).toEqual([...(order.answer as string[])].sort());
  });

  it('copes with a lesson of two words', () => {
    const exercises = build('x', opts, level.slice(0, 2));
    expect(exercises).toHaveLength(4);
  });
});
