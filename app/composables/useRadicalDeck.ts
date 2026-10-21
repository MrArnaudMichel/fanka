import { addRadicalDeck, hasRadicalDeck, RADICAL_DECK_ID } from '~core/seed/radicals';
import { refreshDueCounts } from '~/composables/useDueCounts';

/**
 * Whether the radicals deck is in the collection, and the action that puts it
 * there. Pages never write to the database themselves (see `CLAUDE.md`).
 */
export function useRadicalDeck() {
  /** Null until checked. */
  const present = ref<boolean | null>(null);
  const adding = ref(false);

  async function check(): Promise<void> {
    try {
      present.value = await hasRadicalDeck();
    } catch (err) {
      console.error('useRadicalDeck: could not check the deck', err);
    }
  }

  /** Adds the deck and any of its cards that are missing; the number of cards it added. */
  async function add(now = Date.now()): Promise<number> {
    adding.value = true;
    try {
      const { added } = await addRadicalDeck(now);
      present.value = true;
      await refreshDueCounts();
      return added;
    } finally {
      adding.value = false;
    }
  }

  return { deckId: RADICAL_DECK_ID, present: readonly(present), adding: readonly(adding), check, add };
}
