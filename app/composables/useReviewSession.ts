import { db } from '~core/db/db';
import { cards, items, reviews } from '~core/db/repositories';
import type { Card, Item } from '~core/db/schema';
import { loadSettings } from '~core/db/settings';
import { type Grade, type SrsState, schedulerFor } from '~core/srs';
import { buildQueue } from '~core/srs/queue';
import { introducedSince, startOfDay } from '~/composables/useDueCounts';

interface LogEntry {
  reviewId: string;
  itemId: string;
  grade: Grade;
}

interface PersistedSession {
  queueIds: string[];
  index: number;
  startedAt: number;
  log: LogEntry[];
}

const SESSION_KEY = 'session';

/**
 * A session is a queue plus a cursor, both persisted after every grade.
 * Persisting rather than holding it in memory is what lets a phone be locked
 * mid-session, or a tab be reloaded, without losing the learner's place — the
 * single most annoying thing a review app can do.
 *
 * Every call returns a fresh set of refs — this is not a module singleton
 * like `useSettings`. Two instances only ever agree through what they each
 * read from and write to Dexie (`start`/`grade`/`undo` persist; `restore`
 * reads). A page must call this composable exactly once and pass the result
 * down (props/provide); calling it a second time in the same session creates
 * a second in-memory cursor that does not see the first one's grades until
 * it explicitly `restore()`s, and whose own `persist()` would then overwrite
 * the first instance's more advanced progress with its own stale position.
 */
export function useReviewSession() {
  const queue = ref<Item[]>([]);
  const index = ref(0);
  const revealed = ref(false);
  const startedAt = ref(Date.now());
  const shownAt = ref(Date.now());
  const log = ref<LogEntry[]>([]);
  const card = ref<Card | null>(null);
  const previews = ref<Record<Grade, SrsState>>({} as Record<Grade, SrsState>);

  // Drives `elapsed`. A computed over `Date.now()` has no reactive
  // dependency on the clock — it would be read once and cached forever,
  // freezing the on-screen timer. This ref is instead advanced by a ticking
  // interval, started/stopped by `syncTimer` below, so `elapsed` actually
  // moves.
  const clock = ref(Date.now());
  let timer: ReturnType<typeof setInterval> | null = null;

  const current = computed<Item | null>(() => queue.value[index.value] ?? null);
  const total = computed(() => queue.value.length);
  const position = computed(() => Math.min(index.value + 1, queue.value.length));
  const ended = computed(() => queue.value.length > 0 && index.value >= queue.value.length);
  const elapsed = computed(() => clock.value - startedAt.value);

  function stopTimer(): void {
    if (timer !== null) {
      clearInterval(timer);
      timer = null;
    }
  }

  /** Starts the tick while a session is in progress, stops it once it ends. */
  function syncTimer(): void {
    if (ended.value) {
      stopTimer();
      return;
    }
    if (timer === null) {
      timer = setInterval(() => {
        clock.value = Date.now();
      }, 1000);
    }
  }

  // In a real page this composable is used from a component's setup(), so
  // there is an active effect scope to tie the interval's life to. Outside
  // one (e.g. a plain test) there is nothing to tie it to and nothing to
  // leak into — `failSilently` skips the dev warning for that case rather
  // than forcing every caller to wrap itself in an effectScope.
  onScopeDispose(stopTimer, true);

  async function refreshCurrent(): Promise<void> {
    const item = current.value;
    if (!item) {
      card.value = null;
      previews.value = {} as Record<Grade, SrsState>;
      return;
    }
    card.value = (await cards.get(item.cardId)) ?? null;
    const settings = await loadSettings();
    previews.value = schedulerFor(settings.algorithm).preview(item, Date.now(), {
      desiredRetention: settings.desiredRetention,
      maxInterval: settings.maxInterval,
    });
    revealed.value = false;
    shownAt.value = Date.now();
  }

  async function persist(): Promise<void> {
    const value: PersistedSession = {
      queueIds: queue.value.map((i) => i.id),
      index: index.value,
      startedAt: startedAt.value,
      // `log.value` is a reactive Proxy array — Chrome's structured-clone
      // algorithm can clone one, but neither Node's nor fake-indexeddb's
      // (used by the test suite; both back onto the same V8 serializer)
      // can, and throw "[object Array] could not be cloned" on the write.
      // Rebuilding it as plain objects here, rather than embedding the
      // proxy, keeps this working in both environments.
      log: log.value.map((entry) => ({ reviewId: entry.reviewId, itemId: entry.itemId, grade: entry.grade })),
    };
    await db.settings.put({ key: SESSION_KEY, value });
  }

  async function start(now = Date.now()): Promise<void> {
    const settings = await loadSettings();
    const due = await items.due(now);
    const introducedToday = await introducedSince(startOfDay(now));
    const fresh = await items.fresh(Math.max(0, settings.newPerDay - introducedToday));

    queue.value = buildQueue({ due, fresh, newPerDay: settings.newPerDay, introducedToday });
    index.value = 0;
    log.value = [];
    startedAt.value = now;
    await refreshCurrent();
    await persist();
    syncTimer();
  }

  /**
   * Rebuilds the queue from stored ids, dropping anything since deleted.
   *
   * The stored cursor is a position in the *original* queue. Reusing it
   * as-is against the filtered array (e.g. `min(stored.index, queue.length)`)
   * silently drifts the moment an item *before* the cursor is dropped: every
   * removal shifts everything after it left by one, so the raw offset points
   * one card too far forward for each dropped predecessor — the learner
   * would see a card they had not answered yet skipped. Re-anchoring by
   * counting how many of the items *before* the stored cursor survived the
   * filter keeps the cursor on the same next card regardless of what was
   * dropped ahead of it.
   */
  async function restore(): Promise<boolean> {
    const row = await db.settings.get(SESSION_KEY);
    const stored = row?.value as PersistedSession | undefined;
    if (!stored || stored.queueIds.length === 0) return false;

    const found = await db.items.bulkGet(stored.queueIds);
    queue.value = found.filter((i): i is Item => Boolean(i));
    index.value = found.slice(0, stored.index).filter(Boolean).length;
    startedAt.value = stored.startedAt;
    log.value = stored.log;
    await refreshCurrent();
    syncTimer();
    return true;
  }

  function reveal(): void {
    revealed.value = true;
  }

  async function grade(value: Grade): Promise<void> {
    const item = current.value;
    if (!item) return;

    const settings = await loadSettings();
    const at = Date.now();
    const next = schedulerFor(settings.algorithm).apply(item, value, at, {
      desiredRetention: settings.desiredRetention,
      maxInterval: settings.maxInterval,
    });

    const reviewId = await reviews.record({
      item: { ...item, ...next, updatedAt: at },
      before: { ...item },
      grade: value,
      reviewedAt: at,
      durationMs: at - shownAt.value,
    });

    log.value = [...log.value, { reviewId, itemId: item.id, grade: value }];
    index.value += 1;
    await refreshCurrent();
    await persist();
    syncTimer();
  }

  async function undo(): Promise<void> {
    const last = log.value.at(-1);
    if (!last) return;
    await reviews.undo(last.reviewId);
    log.value = log.value.slice(0, -1);
    index.value = Math.max(0, index.value - 1);
    const restored = await items.get(last.itemId);
    if (restored) queue.value[index.value] = restored;
    await refreshCurrent();
    revealed.value = true;
    await persist();
    syncTimer();
  }

  return {
    queue,
    current,
    card,
    previews,
    revealed,
    index,
    position,
    total,
    ended,
    elapsed,
    log,
    start,
    restore,
    reveal,
    grade,
    undo,
  };
}
