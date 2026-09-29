import { attempts, cards, items } from '~core/db/repositories';
import { type AttemptDetail, type Card, type Item, SELF_GRADED } from '~core/db/schema';
import { MODE_DIRECTION, type SessionMode } from '~core/db/session';
import { studyDeckFilter } from '~core/db/study-decks';
import type { Grade, SrsState } from '~core/srs';
import { pickNext, weightAfter } from '~core/srs/practice';

/**
 * Endless practice in one direction, outside the schedule: cards are drawn
 * from the studied decks (`studyDeckFilter`) for as long as the learner keeps
 * going, missed ones more often (`pickNext`). Nothing is scheduled — no
 * review, no item update — but every answer is logged as a practice attempt
 * for the journal and statistics.
 *
 * Returns the fields of `useReviewSession` that `review.vue` and
 * `writing.vue` read, so either page can run on it in its endless mode:
 * `ended` is always false, `log` stays empty (no undo), and `grade` only
 * decides whether the answer was right (any grade above 1).
 */
export function usePracticeSession(mode: SessionMode) {
  const pool = ref<Item[]>([]);
  const current = ref<Item | null>(null);
  const card = ref<Card | null>(null);
  const revealed = ref(false);
  const busy = ref(false);
  const seen = ref(0);
  const right = ref(0);
  const shownAt = ref(Date.now());

  const weights = new Map<string, number>();
  const recent: string[] = [];

  async function show(id: string | null): Promise<void> {
    const item = pool.value.find((i) => i.id === id) ?? null;
    card.value = item ? ((await cards.get(item.cardId)) ?? null) : null;
    current.value = item;
    revealed.value = false;
    shownAt.value = Date.now();
  }

  function next(): Promise<void> {
    return show(pickNext(pool.value.map((i) => i.id), weights, recent));
  }

  async function start(): Promise<void> {
    busy.value = true;
    try {
      pool.value = await items.pool(MODE_DIRECTION[mode], await studyDeckFilter());
      weights.clear();
      recent.length = 0;
      seen.value = 0;
      right.value = 0;
      await next();
    } finally {
      busy.value = false;
    }
  }

  async function grade(value: Grade, detail: AttemptDetail = SELF_GRADED): Promise<void> {
    const item = current.value;
    if (!item || busy.value) return;
    busy.value = true;
    try {
      const at = Date.now();
      // Logged first: a failed write surfaces to the page (a toast) and the
      // card stays on screen, rather than the answer silently vanishing.
      await attempts.log({ item, grade: value, at, durationMs: at - shownAt.value, detail });
      const correct = value > 1;
      weights.set(item.id, weightAfter(weights.get(item.id) ?? 1, correct));
      recent.push(item.id);
      seen.value += 1;
      if (correct) right.value += 1;
      await next();
    } finally {
      busy.value = false;
    }
  }

  return {
    current,
    card,
    revealed,
    busy: readonly(busy),
    seen: readonly(seen),
    right: readonly(right),
    total: computed(() => pool.value.length),
    index: computed(() => 0),
    position: computed(() => 0),
    ended: computed(() => false),
    log: computed<unknown[]>(() => []),
    intervals: computed(() => ({}) as Record<Grade, number>),
    previews: computed(() => ({}) as Record<Grade, SrsState>),
    /** Always starts fresh: an endless session has no place to resume. */
    restore: async (): Promise<boolean> => false,
    start,
    reveal: () => {
      revealed.value = true;
    },
    grade,
    undo: async (): Promise<void> => {},
  };
}
