import { attempts } from '~core/db/repositories';
import type { Item, WritingResult } from '~core/db/schema';
import type { Grade } from '~core/srs';

export interface FirstTry {
  correct: boolean;
  /** What the card is graded: the right grade when correct, Again otherwise. */
  grade: Grade;
  /** The grade a right answer gets (Hard after a hint in stroke-by-stroke). */
  rightGrade: Grade;
  results: WritingResult[];
}

/**
 * Drawing a word again after its verdict. The first try alone grades the
 * card — a retry never moves the schedule — and each retry is logged as a
 * practice attempt, so Statistics still sees the extra drawing.
 */
export function useWritingRetry() {
  const first = shallowRef<FirstTry | null>(null);
  const retrying = ref(false);
  const retries = ref(0);
  let startedAt = 0;

  /** Called on every check; only the first one of the card is kept. */
  function keepFirst(correct: boolean, rightGrade: Grade, results: readonly WritingResult[]): void {
    if (first.value) return;
    first.value = { correct, grade: correct ? rightGrade : 1, rightGrade, results: [...results] };
  }

  function start(): void {
    retrying.value = true;
    startedAt = Date.now();
  }

  /** A retry was checked: log it as practice, outside the schedule. */
  async function logRetry(item: Item, results: readonly WritingResult[]): Promise<void> {
    const at = Date.now();
    const correct = results.every((r) => r.shapeCorrect);
    // The verdict shows as soon as the retry is checked, not once it is saved.
    retrying.value = false;
    retries.value += 1;
    await attempts.log({ item, grade: correct ? 3 : 1, at, durationMs: at - startedAt, detail: { checked: true, writing: [...results] } });
  }

  function clear(): void {
    first.value = null;
    retrying.value = false;
    retries.value = 0;
  }

  // `first` goes out as a computed, not `readonly(first)`: a readonly ref
  // proxies its value deeply, and IndexedDB cannot clone a proxied result.
  return { first: computed(() => first.value), retrying: readonly(retrying), retries: readonly(retries), keepFirst, start, logRetry, clear };
}
