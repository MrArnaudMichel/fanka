import { type CharacterStrokes, type Point, type StrokeCheck, checkCharacter, toModelSpace } from '~core/chinese/strokes';
import type { WritingResult } from '~core/db/schema';

/** Side of `HanziPad`'s viewBox: strokes arrive in this y-down box. */
export const PAD_SIZE = 1024;

export interface CharacterAttempt {
  character: string;
  model: CharacterStrokes;
  /** In pad space, as drawn — what the verdict overlay redraws. */
  strokes: Point[][];
  check: StrokeCheck;
}

type Loader = (character: string) => Promise<CharacterStrokes | null>;

/**
 * One attempt at writing one card's hanzi, a character at a time. The page
 * owns the session; this owns only what the learner has drawn so far and
 * what the checker made of it, and is reset for every new card.
 *
 * `status` walks `loading` → `drawing` → `checked`, or `loading` →
 * `unsupported` when any character has no stroke data — the page then falls
 * back to Show answer and self-grading for the whole word, since a word half
 * checked and half self-graded has no single honest verdict.
 */
export function useWritingAttempt(load: Loader) {
  const status = ref<'idle' | 'loading' | 'drawing' | 'checked' | 'unsupported'>('idle');
  const characters = ref<string[]>([]);
  const models = ref<CharacterStrokes[]>([]);
  const missing = ref<string[]>([]);
  const position = ref(0);
  const attempts = ref<CharacterAttempt[]>([]);

  // Guards against a slow load for a previous card landing after `start()`
  // has already moved on to the next one.
  let generation = 0;

  const correct = computed(() => status.value === 'checked' && attempts.value.every((a) => a.check.shapeCorrect));
  const firstWrong = computed(() => attempts.value.find((a) => !a.check.shapeCorrect) ?? null);
  const firstOrderFault = computed(() => attempts.value.find((a) => a.check.shapeCorrect && !a.check.orderCorrect) ?? null);
  const results = computed<WritingResult[]>(() =>
    attempts.value.map(({ character, check }) => ({
      character,
      shapeCorrect: check.shapeCorrect,
      orderCorrect: check.orderCorrect,
      error: check.error,
      strokeIndex: check.strokeIndex,
      expected: check.expected,
      drawn: check.drawn,
    })),
  );

  async function start(hanzi: string): Promise<void> {
    generation += 1;
    const mine = generation;
    status.value = 'loading';
    characters.value = [...hanzi];
    models.value = [];
    missing.value = [];
    position.value = 0;
    attempts.value = [];

    const loaded = await Promise.all(characters.value.map((c) => load(c)));
    if (mine !== generation) return;

    missing.value = characters.value.filter((_, i) => !loaded[i]);
    if (missing.value.length > 0 || loaded.length === 0) {
      status.value = 'unsupported';
      return;
    }
    models.value = loaded as CharacterStrokes[];
    status.value = 'drawing';
  }

  /** Checks the character at `position` and moves on, or to the verdict. */
  function submit(strokes: Point[][]): void {
    if (status.value !== 'drawing') return;
    const model = models.value[position.value]!;
    const check = checkCharacter(
      strokes.map((stroke) => toModelSpace(stroke, PAD_SIZE)),
      model,
    );
    attempts.value = [...attempts.value, { character: characters.value[position.value]!, model, strokes, check }];
    if (position.value < characters.value.length - 1) position.value += 1;
    else status.value = 'checked';
  }

  function reset(): void {
    generation += 1;
    status.value = 'idle';
    attempts.value = [];
  }

  return {
    status: readonly(status),
    characters: readonly(characters),
    missing: readonly(missing),
    position: readonly(position),
    attempts: readonly(attempts),
    correct,
    firstWrong,
    firstOrderFault,
    results,
    start,
    submit,
    reset,
  };
}
