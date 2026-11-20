import { db } from './db';
import type { Settings } from './settings';
import type { Bundle } from '~core/chinese/script';
import { isSeededCard } from '~core/seed/seed';

/** The onboarding itself, and the public pages Google Play links to. */
const OPEN_PATHS = ['/welcome', '/privacy', '/delete-account', '/licences'];

/** Whether opening `path` should send the learner to the onboarding first. */
export function needsOnboarding(s: Pick<Settings, 'onboardedAt'>, path: string): boolean {
  return s.onboardedAt === null && !OPEN_PATHS.includes(path);
}

/**
 * Taiwan for an install that studied before bundles existed — a card of its
 * own, or any answer given — since everything it has is Taiwan. Nothing for
 * a fresh install: the starter deck the seed writes on first launch is not
 * study history. Reads the raw tables, not the bundle-scoped repositories,
 * so nothing is hidden by the bundle not being chosen yet.
 */
export async function suggestedBundle(): Promise<Bundle | null> {
  if ((await db.attempts.count()) > 0) return 'taiwan';
  const own = await db.cards.filter((card) => !isSeededCard(card)).first();
  return own ? 'taiwan' : null;
}
