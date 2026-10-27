import { attempts, cards, decks, items } from '~core/db/repositories';
import type { Item } from '~core/db/schema';
import { studyDeckFilter } from '~core/db/study-decks';
import { deckIdsInLesson, lessonNames } from '~core/lessons';
import type { DrillCard } from '~core/translation/drill';

/** A multiple-choice answer is checked by the app, not graded by the learner. */
const CHECKED = { checked: true, writing: null } as const;

/**
 * The words a translation drill can ask, and the place its answers go. Scope
 * is one lesson, or the studied decks when `lesson` is null. Answers are
 * logged as practice on the card's recognition item, so they show in the
 * journal and statistics; they never move the schedule.
 */
export function useTranslationDrill() {
  const words = ref<DrillCard[]>([]);
  const lessons = ref<string[]>([]);
  const itemsByCard = new Map<string, Item>();

  async function loadLessons(): Promise<void> {
    lessons.value = lessonNames(await decks.listAll());
  }

  async function load(lesson: string | null): Promise<void> {
    const deckIds = lesson ? new Set(deckIdsInLesson(await decks.listAll(), lesson)) : await studyDeckFilter();
    const pool = deckIds && deckIds.size === 0 ? [] : await items.pool('recognition', deckIds);
    itemsByCard.clear();
    for (const item of pool) itemsByCard.set(item.cardId, item);
    const found = await Promise.all(pool.map((item) => cards.get(item.cardId)));
    words.value = found
      .filter((card) => card !== undefined && card.translation.trim() !== '')
      .map((card) => ({ id: card!.id, hanzi: card!.hanzi, pinyin: card!.pinyin.map((s) => s.text).join(' '), translation: card!.translation }));
  }

  async function answer(cardId: string, correct: boolean, durationMs: number): Promise<void> {
    const item = itemsByCard.get(cardId);
    if (!item) return;
    await attempts.log({ item, grade: correct ? 3 : 1, at: Date.now(), durationMs, detail: CHECKED });
  }

  return { words: readonly(words), lessons: readonly(lessons), loadLessons, load, answer };
}
