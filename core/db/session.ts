import { db } from './db';
import type { Direction } from './schema';
import type { Grade } from '~core/srs';

/**
 * Review works through recognition items (字 → meaning) and Writing through
 * production items (meaning → 字). Each keeps its own session, so leaving one
 * mid-way never moves the other's cursor.
 */
export type SessionMode = 'review' | 'writing';

export const MODE_DIRECTION: Record<SessionMode, Direction> = {
  review: 'recognition',
  writing: 'production',
};

export interface LogEntry {
  reviewId: string;
  itemId: string;
  grade: Grade;
}

export interface PersistedSession {
  queueIds: string[];
  index: number;
  startedAt: number;
  log: LogEntry[];
}

const keyFor = (mode: SessionMode) => `session:${mode}`;

/** Where the single, mixed-direction session lived before the split. */
const LEGACY_KEY = 'session';

/**
 * `null` unless the stored record is at least shaped like a session. This
 * runs on every app open (a review page restores on mount), so a malformed
 * or half-written record — a previous version's shape, a manual edit, a
 * crash mid-write — must degrade to "no session" rather than throw and
 * blank the screen. `log` alone is defaulted rather than rejected, since a
 * session with a queue and cursor but a lost log is still resumable; it
 * just can't be undone into.
 */
export async function loadSession(mode: SessionMode): Promise<PersistedSession | null> {
  // A mixed-direction session cannot be resumed as either mode; drop it.
  await db.settings.delete(LEGACY_KEY);
  const row = await db.settings.get(keyFor(mode));
  const stored = row?.value as Partial<PersistedSession> | undefined;
  if (!stored || !Array.isArray(stored.queueIds) || typeof stored.index !== 'number' || typeof stored.startedAt !== 'number') {
    return null;
  }
  return {
    queueIds: stored.queueIds,
    index: stored.index,
    startedAt: stored.startedAt,
    log: Array.isArray(stored.log) ? stored.log : [],
  };
}

/**
 * Rebuilds `log` as plain objects rather than writing the caller's array
 * through. A Vue `ref`'s `.value` for an array is a reactive Proxy, which
 * neither Node's nor fake-indexeddb's `structuredClone` (both back onto the
 * same V8 serializer IndexedDB itself would use) can clone — it throws
 * "[object Array] could not be cloned" on the write. Rebuilding here, once,
 * is what lets every caller hand this a `ref.value` without knowing that.
 */
export async function saveSession(mode: SessionMode, session: PersistedSession): Promise<void> {
  const value: PersistedSession = {
    queueIds: [...session.queueIds],
    index: session.index,
    startedAt: session.startedAt,
    log: session.log.map((entry) => ({ reviewId: entry.reviewId, itemId: entry.itemId, grade: entry.grade })),
  };
  await db.settings.put({ key: keyFor(mode), value });
}

export async function clearSession(mode: SessionMode): Promise<void> {
  await db.settings.delete(keyFor(mode));
}
