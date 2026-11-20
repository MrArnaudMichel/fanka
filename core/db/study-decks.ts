import { deckInScope } from './bundle-scope';
import { db } from './db';

const KEY = 'studyDecks';

/**
 * The decks the learner is studying right now, picked on the Decks page.
 * Review and Writing only draw from these. Kept as its own row rather than a
 * field of `Settings`: it is a working selection, not app configuration, and
 * never appears on the Settings screen.
 */
export async function loadStudyDeckIds(): Promise<string[]> {
  const value = (await db.settings.get(KEY))?.value;
  return Array.isArray(value) ? value.filter((id): id is string => typeof id === 'string') : [];
}

export async function saveStudyDeckIds(ids: string[]): Promise<void> {
  await db.settings.put({ key: KEY, value: [...new Set(ids)] });
}

/**
 * The live selected decks, or `undefined` for "every deck". A selection whose
 * decks have all been deleted since means every deck too, not nothing: an
 * empty queue with no visible reason is worse than a broader one.
 */
export async function studyDeckFilter(): Promise<ReadonlySet<string> | undefined> {
  const ids = await loadStudyDeckIds();
  if (ids.length === 0) return undefined;
  const live = (await db.decks.bulkGet(ids)).filter((d) => d && deckInScope(d)).map((d) => d!.id);
  return live.length > 0 ? new Set(live) : undefined;
}
