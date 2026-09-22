import { type DeckColor, type DeckSummary, decks } from '~core/db/repositories';
import type { Deck } from '~core/db/schema';
import { refreshDueCounts } from '~/composables/useDueCounts';

export interface DeckInput {
  name: string;
  description: string;
  colorToken: DeckColor;
  tag: string;
}

export type DeckPatch = Partial<DeckInput>;

/**
 * The deck list, for pages. Pages never touch Dexie or a repository
 * directly (see `CLAUDE.md`); this is the seam they read decks through.
 */
export function useDecks() {
  return {
    listAll: (): Promise<Deck[]> => decks.listAll(),
    summaries: (now = Date.now()): Promise<DeckSummary[]> => decks.summaries(now),
    create: (input: DeckInput, now = Date.now()): Promise<Deck> => decks.create(input, now),
    update: (id: string, patch: DeckPatch, now = Date.now()): Promise<void> => decks.update(id, patch, now),
    /** Soft delete — the deck and its cards keep their review history. Its cards leave the due count with it. */
    async remove(id: string, now = Date.now()): Promise<void> {
      await decks.softDelete(id, now);
      await refreshDueCounts();
    },
  };
}
