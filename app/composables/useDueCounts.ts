import { db } from '~core/db/db';
import { items } from '~core/db/repositories';
import type { Direction, Item } from '~core/db/schema';
import { MODE_DIRECTION, type SessionMode } from '~core/db/session';
import { type Settings, loadSettings } from '~core/db/settings';
import { studyDeckFilter } from '~core/db/study-decks';

export interface ModeCounts {
  total: number;
  fresh: number;
  learning: number;
  review: number;
}

const EMPTY: ModeCounts = { total: 0, fresh: 0, learning: 0, review: 0 };
const counts = ref<Record<SessionMode, ModeCounts>>({ review: { ...EMPTY }, writing: { ...EMPTY } });

async function countsFor(mode: SessionMode, now: number): Promise<ModeCounts> {
  const { due, fresh } = await dueToday(now, MODE_DIRECTION[mode]);
  return {
    total: due.length + fresh.length,
    fresh: fresh.length,
    learning: due.filter((i) => i.state === 'learning' || i.state === 'relearning').length,
    review: due.filter((i) => i.state === 'review').length,
  };
}

async function refresh(now = Date.now()): Promise<void> {
  const [review, writing] = await Promise.all([countsFor('review', now), countsFor('writing', now)]);
  counts.value = { review, writing };
}

/**
 * Called by every collection write (`useDecks`, `useBrowse`,
 * `useCardEditor`, `useImport`) once it has landed, so the shell's
 * Review and Writing badges never go stale after a deck delete, a suspend or
 * an import — pages never have to remember to do it themselves. Never
 * throws: the write itself already succeeded, and a failed recount must not
 * turn it into a reported failure.
 */
export async function refreshDueCounts(): Promise<void> {
  try {
    await refresh();
  } catch (err) {
    console.error('useDueCounts: refresh failed', err);
  }
}

/** Shared across the shell and the Today page so both read the same numbers. */
export function useDueCounts() {
  // Fire-and-forget: nothing awaits the initial load, so a rejection would
  // otherwise vanish as an unhandled promise rejection and leave the counts
  // pinned at zero with no sign anything went wrong.
  if (import.meta.client) refresh().catch((err: unknown) => console.error('useDueCounts: refresh failed', err));

  return { counts: readonly(counts), refresh };
}

export interface DueToday {
  due: Item[];
  /** New items, already limited to what is left of today's allowance. */
  fresh: Item[];
  introducedToday: number;
  settings: Settings;
}

/**
 * What today's work in one direction is at `now`: every due item, and as
 * many new items as the daily allowance still permits once today's
 * introductions in that direction are counted — `newPerDay` applies to
 * Review and to Writing each on its own. The one place that allowance is
 * computed — the Today page's counts and a session's queue both read it
 * from here, so they cannot disagree. Both are narrowed to the decks being
 * studied (`studyDeckFilter`), when the learner has picked any.
 */
export async function dueToday(now: number, dir: Direction): Promise<DueToday> {
  const settings = await loadSettings();
  const deckIds = await studyDeckFilter();
  const due = await items.due(now, dir, deckIds);
  const introducedToday = await introducedSince(startOfDay(now), dir);
  const fresh = await items.fresh(Math.max(0, settings.newPerDay - introducedToday), dir, deckIds);
  return { due, fresh, introducedToday, settings };
}

export function startOfDay(now: number): number {
  const d = new Date(now);
  d.setHours(0, 0, 0, 0);
  return d.getTime();
}

/**
 * New items introduced since `since`, counted from the log rather than
 * tracked — in one direction when `dir` is given, read from the item id
 * (`itemId()` builds it as `<cardId>:<dir>`).
 */
export async function introducedSince(since: number, dir?: Direction): Promise<number> {
  const recent = await db.reviews.where('reviewedAt').aboveOrEqual(since).toArray();
  return new Set(
    recent.filter((r) => r.before.state === 'new' && (!dir || r.itemId.endsWith(`:${dir}`))).map((r) => r.itemId),
  ).size;
}
