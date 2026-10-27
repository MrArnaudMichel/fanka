import { decks } from '~core/db/repositories';
import { type LessonSummary, summarizeLessons } from '~core/lessons';

/**
 * Every lesson with its counts, and how many decks sit outside any lesson.
 * Pages never read the database themselves (see `CLAUDE.md`).
 */
export function useLessons() {
  const lessons = ref<LessonSummary[]>([]);
  const untagged = ref(0);
  const loading = ref(true);
  const failed = ref(false);

  async function load(now = Date.now()): Promise<void> {
    loading.value = true;
    failed.value = false;
    try {
      const rows = await decks.summaries(now);
      lessons.value = summarizeLessons(rows);
      untagged.value = rows.filter((r) => !r.deck.tag.trim()).length;
    } catch (err) {
      console.error('useLessons: could not load the lessons', err);
      failed.value = true;
    } finally {
      loading.value = false;
    }
  }

  return { lessons: readonly(lessons), untagged: readonly(untagged), loading: readonly(loading), failed: readonly(failed), load };
}
