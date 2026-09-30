import type { MaybeRefOrGetter } from 'vue';
import { type CharacterStrokes, type Point, type StrokeCheck, checkCharacter, checkStroke, toModelSpace } from '~core/chinese/strokes';
import type { WritingResult } from '~core/db/schema';

/** Side of `HanziPad`'s viewBox: strokes arrive in this y-down box. */
export const PAD_SIZE = 1024;

export interface CharacterAttempt {
  character: string;
  model: CharacterStrokes;
  /** In pad space, as drawn — what the verdict overlay redraws. */
  strokes: Point[][];
  check: StrokeCheck;
  /** Live mode only: strokes rejected while drawing this character. */
  rejected?: number;
  /** Live mode only: the expected stroke was shown as a hint. */
  hinted?: boolean;
}

/** Consecutive rejections of the same expected stroke before it is shown. */
export const HINT_AFTER = 3;

export interface WritingAttemptOptions {
  /**
   * Stroke-by-stroke feedback: each stroke is checked as it is drawn and a
   * wrong one is refused, instead of the whole character on Check. Read at
   * `start()`, so a card keeps the mode it began in.
   */
  live?: MaybeRefOrGetter<boolean>;
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
 *
 * In live mode the page feeds each stroke to `addStroke()` instead of the
 * whole character to `submit()`. A stroke is kept only when it follows the
 * next expected median (either way round); otherwise it is refused and
 * `lastRejected` ticks so the page can flash it. Every character so drawn
 * ends up right, so the verdict that matters is its order: a stroke kept
 * backwards, or a refused stroke that followed a later median (drawn ahead
 * of its turn), faults it. After `HINT_AFTER` refusals in a row, `hint`
 * names the expected stroke until it is drawn.
 */
export function useWritingAttempt(load: Loader, options: WritingAttemptOptions = {}) {
  const status = ref<'idle' | 'loading' | 'drawing' | 'checked' | 'unsupported'>('idle');
  const characters = ref<string[]>([]);
  const models = ref<CharacterStrokes[]>([]);
  const missing = ref<string[]>([]);
  const position = ref(0);
  const attempts = ref<CharacterAttempt[]>([]);

  const live = ref(false);
  /** Live mode: the current character's kept strokes, in pad space. */
  const strokes = ref<Point[][]>([]);
  let strokesReversed: boolean[] = [];
  /** First expected stroke at which a later stroke was attempted, if any. */
  let orderFaultAt: number | null = null;
  let misses = 0;
  let rejectedHere = 0;
  let hintedHere = false;
  const hint = ref<number | null>(null);
  const hintsUsed = ref(false);
  /** Ticks on every refused stroke. */
  const lastRejected = ref(0);

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
    live.value = toValue(options.live) ?? false;
    hintsUsed.value = false;
    freshCharacter();

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
  function submit(drawn: Point[][]): void {
    if (status.value !== 'drawing' || live.value) return;
    const model = models.value[position.value]!;
    const check = checkCharacter(
      drawn.map((stroke) => toModelSpace(stroke, PAD_SIZE)),
      model,
    );
    record({ character: characters.value[position.value]!, model, strokes: drawn, check });
  }

  function record(attempt: CharacterAttempt): void {
    attempts.value = [...attempts.value, attempt];
    if (position.value < characters.value.length - 1) {
      position.value += 1;
      freshCharacter();
    } else status.value = 'checked';
  }

  /** Live mode: the current character starts over. Faults already made stay. */
  function resetCharacter(): void {
    strokes.value = [];
    strokesReversed = [];
    misses = 0;
    hint.value = null;
  }

  /** The next character: its predecessor's faults are forgotten too. */
  function freshCharacter(): void {
    resetCharacter();
    orderFaultAt = null;
    rejectedHere = 0;
    hintedHere = false;
  }

  /**
   * Live mode: checks one stroke (pad space) against the next expected one.
   * `accepted` strokes are kept — the character is recorded once its last
   * stroke is — and `rejected` ones are not.
   */
  function addStroke(stroke: Point[]): 'accepted' | 'rejected' | 'ignored' {
    if (status.value !== 'drawing' || !live.value) return 'ignored';
    const model = models.value[position.value]!;
    const next = strokes.value.length;
    const inModel = toModelSpace(stroke, PAD_SIZE);
    const verdict = checkStroke(inModel, model, next);

    if (!verdict.matches) {
      rejectedHere += 1;
      misses += 1;
      lastRejected.value += 1;
      const ahead = model.medians.some((_, j) => j > next && checkStroke(inModel, model, j).matches);
      if (ahead && orderFaultAt === null) orderFaultAt = next;
      if (misses >= HINT_AFTER && hint.value === null) {
        hint.value = next;
        hintedHere = true;
        hintsUsed.value = true;
      }
      return 'rejected';
    }

    strokes.value = [...strokes.value, stroke];
    strokesReversed = [...strokesReversed, verdict.reversed];
    misses = 0;
    hint.value = null;
    if (strokes.value.length === model.medians.length) completeCharacter(model);
    return 'accepted';
  }

  function completeCharacter(model: CharacterStrokes): void {
    const expected = model.medians.length;
    const backwards = strokesReversed.findIndex(Boolean);
    const base = {
      shapeCorrect: true,
      expected,
      drawn: expected,
      match: Array.from({ length: expected }, (_, i) => i),
      reversed: [...strokesReversed],
    };
    const check: StrokeCheck =
      orderFaultAt !== null
        ? { ...base, orderCorrect: false, error: 'stroke-order', strokeIndex: orderFaultAt }
        : backwards !== -1
          ? { ...base, orderCorrect: false, error: 'stroke-direction', strokeIndex: backwards }
          : { ...base, orderCorrect: true, error: null, strokeIndex: null };
    const attempt: CharacterAttempt = {
      character: characters.value[position.value]!,
      model,
      strokes: strokes.value,
      check,
      rejected: rejectedHere,
      hinted: hintedHere,
    };
    record(attempt);
  }

  /** Live mode: drops the last kept stroke, as the pad's Undo stroke does. */
  function undoStroke(): void {
    if (status.value !== 'drawing' || !live.value || strokes.value.length === 0) return;
    strokes.value = strokes.value.slice(0, -1);
    strokesReversed = strokesReversed.slice(0, -1);
    misses = 0;
    hint.value = null;
  }

  /** Live mode: the current character starts over, as the pad's Clear does. */
  function restartCharacter(): void {
    if (status.value !== 'drawing' || !live.value) return;
    resetCharacter();
  }

  function reset(): void {
    generation += 1;
    status.value = 'idle';
    attempts.value = [];
    hintsUsed.value = false;
    freshCharacter();
  }

  return {
    status: readonly(status),
    characters: readonly(characters),
    missing: readonly(missing),
    position: readonly(position),
    attempts: readonly(attempts),
    live: readonly(live),
    strokes: readonly(strokes),
    model: computed(() => (status.value === 'drawing' ? (models.value[position.value] ?? null) : null)),
    hint: readonly(hint),
    hintsUsed: readonly(hintsUsed),
    lastRejected: readonly(lastRejected),
    correct,
    firstWrong,
    firstOrderFault,
    results,
    start,
    submit,
    addStroke,
    undoStroke,
    restartCharacter,
    reset,
  };
}
