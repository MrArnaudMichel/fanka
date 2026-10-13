import { attempts, cards, items, reviews } from '~core/db/repositories';
import { type AttemptDetail, type Card, type Item, SELF_GRADED } from '~core/db/schema';
import { MODE_DIRECTION, type SessionMode } from '~core/db/session';
import { loadSettings } from '~core/db/settings';
import { studyDeckFilter } from '~core/db/study-decks';
import { type Grade, type SrsState, schedulerFor } from '~core/srs';
import { pickNext, weightAfter } from '~core/srs/practice';

/** How many cards endless practice in this mode would draw from right now. */
export async function practicePoolSize(mode: SessionMode): Promise<number> {
  return (await items.pool(MODE_DIRECTION[mode], await studyDeckFilter())).length;
}

/**
 * Endless practice in one direction, outside the schedule: cards are drawn
 * from the studied decks (`studyDeckFilter`) for as long as the learner keeps
 * going, missed ones more often (`pickNext`). Every answer is logged as a
 * practice attempt for the journal and statistics. Only a new card's first
 * answer touches the schedule (`startSchedule`): practising a word counts as
 * starting to learn it, and deck progress and known words follow.
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

  /**
   * A new card answered in practice has been studied: its first answer is a
   * real review, so the card leaves New and the schedule brings it back. The
   * pool keeps the scheduled copy, so a later answer in this session on the
   * same card is a plain practice attempt.
   */
  async function startSchedule(item: Item, value: Grade, at: number, detail: AttemptDetail): Promise<void> {
    const settings = await loadSettings();
    const next = schedulerFor(settings.algorithm).apply(item, value, at, {
      desiredRetention: settings.desiredRetention,
      maxInterval: settings.maxInterval,
    });
    const scheduled: Item = { ...item, ...next, updatedAt: at };
    await reviews.record({ item: scheduled, before: { ...item }, grade: value, reviewedAt: at, durationMs: at - shownAt.value, detail, source: 'practice' });
    pool.value = pool.value.map((i) => (i.id === item.id ? scheduled : i));
  }

  async function grade(value: Grade, detail: AttemptDetail = SELF_GRADED): Promise<void> {
    const item = current.value;
    if (!item || busy.value) return;
    busy.value = true;
    try {
      const at = Date.now();
      // Logged first: a failed write surfaces to the page (a toast) and the
      // card stays on screen, rather than the answer silently vanishing.
      if (item.state === 'new') await startSchedule(item, value, at, detail);
      else await attempts.log({ item, grade: value, at, durationMs: at - shownAt.value, detail });
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
