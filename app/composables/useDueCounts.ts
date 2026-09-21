import { db } from '~core/db/db';
import { items } from '~core/db/repositories';
import type { Item } from '~core/db/schema';
import { type Settings, loadSettings } from '~core/db/settings';

const total = ref(0);
const byState = ref({ fresh: 0, learning: 0, review: 0 });

/** Shared across the shell and the Today page so both read one number. */
export function useDueCounts() {
  async function refresh(now = Date.now()): Promise<void> {
    const { due, fresh } = await dueToday(now);

    byState.value = {
      fresh: fresh.length,
      learning: due.filter((i) => i.state === 'learning' || i.state === 'relearning').length,
      review: due.filter((i) => i.state === 'review').length,
    };
    total.value = due.length + fresh.length;
  }

  // Fire-and-forget: nothing awaits the initial load, so a rejection would
  // otherwise vanish as an unhandled promise rejection and leave the counts
  // pinned at zero with no sign anything went wrong.
  if (import.meta.client) refresh().catch((err: unknown) => console.error('useDueCounts: refresh failed', err));

  return { total: readonly(total), byState: readonly(byState), refresh };
}

export interface DueToday {
  due: Item[];
  /** New items, already limited to what is left of today's allowance. */
  fresh: Item[];
  introducedToday: number;
  settings: Settings;
}

/**
 * What today's work is at `now`: every due item, and as many new items as
 * the daily allowance still permits once today's introductions are counted.
 * The one place that allowance is computed — the Today page's counts and a
 * review session's queue both read it from here, so they cannot disagree.
 */
export async function dueToday(now: number): Promise<DueToday> {
  const settings = await loadSettings();
  const due = await items.due(now);
  const introducedToday = await introducedSince(startOfDay(now));
  const fresh = await items.fresh(Math.max(0, settings.newPerDay - introducedToday));
  return { due, fresh, introducedToday, settings };
}

export function startOfDay(now: number): number {
  const d = new Date(now);
  d.setHours(0, 0, 0, 0);
  return d.getTime();
}

/** New cards introduced today, counted from the log rather than tracked. */
export async function introducedSince(since: number): Promise<number> {
  const recent = await db.reviews.where('reviewedAt').aboveOrEqual(since).toArray();
  return new Set(recent.filter((r) => r.before.state === 'new').map((r) => r.itemId)).size;
}
