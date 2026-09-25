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

  function toggle(deckId: string, studying: boolean): Promise<void> {
    const rest = ids.value.filter((id) => id !== deckId);
    return save(studying ? [...rest, deckId] : rest);
  }

  return { ids: readonly(ids), load, toggle, clear: () => save([]) };
}
