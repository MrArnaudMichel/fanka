import { cards, decks, items } from '~core/db/repositories';
import { type AttemptDetail, type Card, type Item, SELF_GRADED } from '~core/db/schema';
import { MODE_DIRECTION, type SessionMode } from '~core/db/session';
import { deckIdsInLesson } from '~core/lessons';
import { answerLesson, firstTryCount, type LessonQueue, lessonDone, startLesson } from '~core/srs/lesson';
import type { Grade, SrsState } from '~core/srs';
import { recordPracticeAnswer } from '~/composables/usePracticeSession';

/**
 * A whole lesson in one sitting, in one direction: every card of the decks
 * tagged with the lesson, until each has been answered right once (see
 * `~core/srs/lesson`). Answers are written as practice, the same way as
 * endless practice (`recordPracticeAnswer`): a new card starts its schedule,
 * any other is logged without moving it.
 *
 * Returns the fields of `useReviewSession` that `review.vue` and
 * `writing.vue` read, plus the lesson's own progress.
 */
export function useLessonSession(mode: SessionMode, lesson: string) {
  const pool = ref<Item[]>([]);
  const state = ref<LessonQueue>(startLesson([]));
  const current = ref<Item | null>(null);
  const card = ref<Card | null>(null);
  const revealed = ref(false);
  const busy = ref(false);
  const started = ref(false);
  const seen = ref(0);
  const right = ref(0);
  const shownAt = ref(Date.now());

  async function show(): Promise<void> {
    const id = state.value.queue[0];
    const item = pool.value.find((i) => i.id === id) ?? null;
    card.value = item ? ((await cards.get(item.cardId)) ?? null) : null;
    current.value = item;
    revealed.value = false;
    shownAt.value = Date.now();
  }

  async function start(): Promise<void> {
    busy.value = true;
    try {
      const deckIds = new Set(deckIdsInLesson(await decks.listAll(), lesson));
      pool.value = deckIds.size > 0 ? await items.pool(MODE_DIRECTION[mode], deckIds) : [];
      state.value = startLesson(pool.value.map((i) => i.id));
      seen.value = 0;
      right.value = 0;
      started.value = true;
      await show();
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
      const after = await recordPracticeAnswer(item, value, at, at - shownAt.value, detail);
      if (after !== item) pool.value = pool.value.map((i) => (i.id === item.id ? after : i));
      const correct = value > 1;
      state.value = answerLesson(state.value, item.id, correct);
      seen.value += 1;
      if (correct) right.value += 1;
      await show();
    } finally {
      busy.value = false;
    }
  }

  const learned = computed(() => state.value.learned.length);

  return {
    lesson,
    current,
    card,
    revealed,
    busy: readonly(busy),
    seen: readonly(seen),
    right: readonly(right),
    learned,
    firstTry: computed(() => firstTryCount(state.value)),
    total: computed(() => pool.value.length),
    index: learned,
    position: learned,
    ended: computed(() => started.value && lessonDone(state.value)),
    log: computed<unknown[]>(() => []),
    intervals: computed(() => ({}) as Record<Grade, number>),
    previews: computed(() => ({}) as Record<Grade, SrsState>),
    /** A lesson always starts from the top. */
    restore: async (): Promise<boolean> => false,
    start,
    reveal: () => {
      revealed.value = true;
    },
    grade,
    undo: async (): Promise<void> => {},
  };
}
