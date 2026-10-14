import type { KtOption } from 'kanto-ds';
import { stats } from '~core/db/repositories';
import { compareNames, lessonNames, lessonOf } from '~core/lessons';
import { type FilteredSnapshot, type StatsFilter, type StatsSnapshot, applyFilter } from '~core/stats';

/**
 * The Statistics page's one seam into the database (pages never touch Dexie
 * or a repository directly). Reads one snapshot when the page opens; the
 * filter recomputes everything from it in memory. Holds no shared state —
 * each page visit reads afresh.
 */
export function useStats() {
  const snapshot = shallowRef<StatsSnapshot | null>(null);
  const loading = ref(true);
  const loadError = ref(false);
  const now = ref(Date.now());
  const filter = reactive<StatsFilter>({ window: '30d', deckId: null, lesson: null, mode: null });

  const filtered = computed<FilteredSnapshot | null>(() =>
    snapshot.value ? applyFilter(snapshot.value, { deckId: filter.deckId, lesson: filter.lesson, mode: filter.mode }) : null,
  );

  /** The deck filter alone: words known go through recognition items whatever the mode filter. */
  const everyMode = computed<FilteredSnapshot | null>(() =>
    snapshot.value ? applyFilter(snapshot.value, { deckId: filter.deckId, lesson: filter.lesson, mode: null }) : null,
  );

  /** No deck and no mode: Memory's Decks table compares every deck. */
  const everyDeck = computed<FilteredSnapshot | null>(() => (snapshot.value ? applyFilter(snapshot.value, { deckId: null, mode: null }) : null));

  const liveDecks = computed(() => (snapshot.value?.decks ?? []).filter((d) => d.deletedAt === null));

  /** Empty when no deck carries a tag: the page then shows no lesson filter at all. */
  const lessonOptions = computed<KtOption[]>(() => lessonNames(liveDecks.value).map((l) => ({ id: l, label: l })));

  /** With a lesson chosen, only its decks. */
  const deckOptions = computed<KtOption[]>(() =>
    liveDecks.value
      .filter((d) => filter.lesson === null || lessonOf(d) === filter.lesson)
      .sort((a, b) => compareNames(a.name, b.name))
      .map((d) => ({ id: d.id, label: d.name })),
  );

  /** A deck outside the new lesson would filter the page down to nothing; it is dropped. */
  function selectLesson(lesson: string | null): void {
    filter.lesson = lesson;
    if (lesson !== null && filter.deckId !== null && !deckOptions.value.some((o) => o.id === filter.deckId)) filter.deckId = null;
  }

  /** A deck picked outside the current lesson (from Memory's table) clears the lesson. */
  function selectDeck(deckId: string | null): void {
    if (deckId !== null && !deckOptions.value.some((o) => o.id === deckId)) filter.lesson = null;
    filter.deckId = deckId;
  }

  async function load(): Promise<void> {
    loading.value = true;
    loadError.value = false;
    try {
      snapshot.value = await stats.snapshot();
      now.value = Date.now();
    } catch (err) {
      console.error('stats: failed to load the snapshot', err);
      loadError.value = true;
    } finally {
      loading.value = false;
    }
  }

  return { loading, loadError, filter, filtered, everyMode, everyDeck, lessonOptions, deckOptions, selectLesson, selectDeck, now, load };
}
