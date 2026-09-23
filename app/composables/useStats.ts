import { type StatsSummary, stats } from '~core/db/repositories';

/**
 * The Statistics page's one seam into the database (see `CLAUDE.md`: pages
 * never touch Dexie or a repository directly). Unlike `useSettings` or
 * `useDueCounts`, this holds no shared state — each call reads a fresh
 * snapshot, which is all a stats screen needs.
 */
export function useStats() {
  return {
    summary: (now = Date.now()): Promise<StatsSummary> => stats.summary(now),
  };
}
