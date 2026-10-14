import { loadStudyDeckIds, saveStudyDeckIds } from '~core/db/study-decks';
import { refreshDueCounts } from '~/composables/useDueCounts';

/**
 * The decks being studied, for the Decks page. An empty selection means every
 * deck. Every change lands in Dexie, then recounts the Review and Writing
 * badges, which read the same selection through `dueToday()`. A session
 * already under way keeps its queue; the next one uses the new selection.
 */
export function useStudyDecks() {
  const ids = ref<string[]>([]);

  async function load(): Promise<void> {
    ids.value = await loadStudyDeckIds();
  }

  async function save(next: string[]): Promise<void> {
    await saveStudyDeckIds(next);
    ids.value = next;
    await refreshDueCounts();
  }

  /** Several decks in or out at once — a lesson's — as one save and one recount. */
  function toggleMany(deckIds: readonly string[], studying: boolean): Promise<void> {
    if (!studying) return save(ids.value.filter((id) => !deckIds.includes(id)));
    return save([...ids.value, ...deckIds.filter((id) => !ids.value.includes(id))]);
  }

  const toggle = (deckId: string, studying: boolean): Promise<void> => toggleMany([deckId], studying);

  return { ids: readonly(ids), load, toggle, toggleMany, clear: () => save([]) };
}
