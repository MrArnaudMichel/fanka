import { decks } from '~core/db/repositories';
import type { Deck } from '~core/db/schema';

/**
 * The deck list, for pages. Pages never touch Dexie or a repository
 * directly (see `CLAUDE.md`); this is the seam they read decks through.
 */
export function useDecks() {
  return {
    listAll: (): Promise<Deck[]> => decks.listAll(),
  };
}
