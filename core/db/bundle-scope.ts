import type { Bundle } from '~core/chinese/script';
import type { Deck } from './schema';

let active: Bundle | null = null;

/**
 * The bundle the app shows. Set from Settings whenever they load or change;
 * read by every query, so a switch applies on the next query with no reload.
 * `null` (a learner not yet onboarded) means no narrowing: existing data is
 * never hidden.
 */
export function setActiveBundle(bundle: Bundle | null): void {
  active = bundle;
}

export function activeBundle(): Bundle | null {
  return active;
}

/** A deck the learner sees: not deleted, and in the active bundle (any bundle while none is active). */
export function deckInScope(deck: Pick<Deck, 'deletedAt' | 'bundle'>): boolean {
  return deck.deletedAt === null && (active === null || deck.bundle === active);
}
