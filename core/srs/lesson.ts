/**
 * Learning a whole lesson in one sitting: every card once, in a shuffled
 * order, until each has been answered right. A miss puts the card back a few
 * places further on, so it returns while still fresh but not straight away.
 * Pure — the session that drives it keeps the state and writes the answers.
 */

/** How many cards come between a miss and its next showing, when there are that many left. */
export const RETRY_GAP = 3;

export interface LessonQueue {
  /** Ids still to answer right, the next one first. */
  queue: string[];
  /** Ids answered right, in the order they were learned. */
  learned: string[];
  /** Misses per id, for the summary. */
  misses: Record<string, number>;
}

export function startLesson(ids: readonly string[], random: () => number = Math.random): LessonQueue {
  const queue = [...new Set(ids)];
  for (let i = queue.length - 1; i > 0; i -= 1) {
    const j = Math.floor(random() * (i + 1));
    [queue[i], queue[j]] = [queue[j]!, queue[i]!];
  }
  return { queue, learned: [], misses: {} };
}

/** The state after answering the card at the head of the queue. Any other id leaves it unchanged. */
export function answerLesson(state: LessonQueue, id: string, correct: boolean): LessonQueue {
  if (state.queue[0] !== id) return state;
  const rest = state.queue.slice(1);
  if (correct) return { ...state, queue: rest, learned: [...state.learned, id] };
  const at = Math.min(RETRY_GAP, rest.length);
  return {
    ...state,
    queue: [...rest.slice(0, at), id, ...rest.slice(at)],
    misses: { ...state.misses, [id]: (state.misses[id] ?? 0) + 1 },
  };
}

export function lessonDone(state: LessonQueue): boolean {
  return state.queue.length === 0;
}

/** Learned on the first try: no miss on record. */
export function firstTryCount(state: LessonQueue): number {
  return state.learned.filter((id) => !state.misses[id]).length;
}
