import { describe, expect, it } from 'vitest';
import { findRadical, RADICALS, radicalForms } from '~core/radicals';
import { buildQuiz, CHOICE_COUNT } from '~core/radicals/quiz';

/** A small deterministic generator, so a failing case can be replayed. */
function seeded(seed: number): () => number {
  let s = seed;
  return () => {
    s = (s * 1103515245 + 12345) % 2 ** 31;
    return s / 2 ** 31;
  };
}

describe('buildQuiz', () => {
  it('asks as many questions as asked for', () => {
    expect(buildQuiz(RADICALS, RADICALS, { kinds: ['meaning'], length: 10 }, seeded(1))).toHaveLength(10);
  });

  it('asks each target once before repeating one', () => {
    const targets = RADICALS.slice(0, 5);
    const quiz = buildQuiz(targets, RADICALS, { kinds: ['meaning'], length: 5 }, seeded(2));
    expect(new Set(quiz.map((q) => q.radicalId)).size).toBe(5);
  });

  it('cycles through the targets again when the round is longer', () => {
    const quiz = buildQuiz(RADICALS.slice(0, 3), RADICALS, { kinds: ['form'], length: 7 }, seeded(3));
    expect(quiz).toHaveLength(7);
  });

  it('gives four distinct choices, the answer among them', () => {
    for (let seed = 1; seed <= 50; seed += 1) {
      for (const q of buildQuiz(RADICALS, RADICALS, { kinds: ['meaning', 'form', 'spot'], length: 20 }, seeded(seed))) {
        expect(q.choices).toHaveLength(CHOICE_COUNT);
        expect(new Set(q.choices).size).toBe(CHOICE_COUNT);
        expect(q.answer).toBeGreaterThanOrEqual(0);
      }
    }
  });

  it('asks the meaning of a radical, with its meaning as the answer', () => {
    const [q] = buildQuiz([findRadical('kangxi-85')!], RADICALS, { kinds: ['meaning'], length: 1 }, seeded(4));
    expect(q!.prompt).toBe('水 氵');
    expect(q!.choices[q!.answer]).toBe('water');
    expect(q!.spoken).toBe('水');
  });

  it('asks for the radical behind a meaning', () => {
    const [q] = buildQuiz([findRadical('kangxi-9')!], RADICALS, { kinds: ['form'], length: 1 }, seeded(5));
    expect(q!.prompt).toBe('person');
    expect(q!.choices[q!.answer]).toBe('人 亻');
  });

  it('asks which radical a character is filed under, from its examples', () => {
    const fire = findRadical('kangxi-86')!;
    const [q] = buildQuiz([fire], RADICALS, { kinds: ['spot'], length: 1 }, seeded(6));
    expect(fire.examples.map((e) => e.hanzi)).toContain(q!.prompt);
    expect(q!.choices[q!.answer]).toBe(radicalForms(fire).join(' '));
  });

  it('is empty with no targets or no kinds', () => {
    expect(buildQuiz([], RADICALS, { kinds: ['meaning'], length: 5 })).toEqual([]);
    expect(buildQuiz(RADICALS, RADICALS, { kinds: [], length: 5 })).toEqual([]);
  });
});
