import type { KtOption } from 'kanto-ds';
import { stats } from '~core/db/repositories';
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
  const filter = reactive<StatsFilter>({ window: '30d', deckId: null, mode: null });

  const filtered = computed<FilteredSnapshot | null>(() =>
    snapshot.value ? applyFilter(snapshot.value, { deckId: filter.deckId, mode: filter.mode }) : null,
  );

  const deckOptions = computed<KtOption[]>(() =>
    (snapshot.value?.decks ?? [])
      .filter((d) => d.deletedAt === null)
      .sort((a, b) => a.name.localeCompare(b.name))
      .map((d) => ({ id: d.id, label: d.name })),
  );

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

  return { loading, loadError, filter, filtered, deckOptions, now, load };
}
