import { cards, items, reviews } from '~core/db/repositories';
import type { Card, Item } from '~core/db/schema';
import { type LogEntry, clearSession, loadSession, saveSession } from '~core/db/session';
import { loadSettings } from '~core/db/settings';
import { GRADES, type Grade, type SrsState, schedulerFor } from '~core/srs';
import { buildQueue } from '~core/srs/queue';
import { introducedSince, startOfDay } from '~/composables/useDueCounts';

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
 * it explicitly `restore()`s, and whose own persisted write would then
 * overwrite the first instance's more advanced progress with its own stale
 * position.
 */
export function useReviewSession() {
  const queue = ref<Item[]>([]);
  const index = ref(0);
  const revealed = ref(false);
  const started = ref(false);
  const startedAt = ref(Date.now());
  const shownAt = ref(Date.now());
  const log = ref<LogEntry[]>([]);
  const card = ref<Card | null>(null);
  const previews = ref<Record<Grade, SrsState>>({} as Record<Grade, SrsState>);

  // The instant `preview()` was last computed against. Intervals below are
  // derived from this rather than from `Date.now()` at read time, so they
  // do not drift while the page displaying them sits backgrounded — see
  // `intervals`.
  const previewAnchor = ref(Date.now());

  // Drives `elapsed`. A computed over `Date.now()` has no reactive
  // dependency on the clock — it would be read once and cached forever,
  // freezing the on-screen timer. This ref is instead advanced by a ticking
  // interval, started/stopped by `syncTimer` below, so `elapsed` actually
  // moves.
  const clock = ref(Date.now());
  let timer: ReturnType<typeof setInterval> | null = null;

  // A second call into `grade`/`undo`/`start`/`restore` while one is still
  // in flight (an ordinary mobile mis-tap on a grade bar mid-write) would
  // otherwise race: both read the same `current` item, both record a
  // review, the cursor advances twice, and whichever `persist()` finishes
  // last wins regardless of which grade the learner meant to land on. This
  // guard makes the second call a no-op instead.
  const busy = ref(false);

  const current = computed<Item | null>(() => queue.value[index.value] ?? null);
  const total = computed(() => queue.value.length);
  const position = computed(() => Math.min(index.value + 1, queue.value.length));
  // `started` distinguishes "nothing loaded yet" from "loaded, and it was
  // empty" — without it, a `start()` that finds zero due-or-new items (a
  // learner who has cleared the day) reports the same `ended: false` as a
  // session that was never started at all, an on-screen state that is
  // neither a card nor a completion message.
  const ended = computed(() => started.value && index.value >= queue.value.length);
  const elapsed = computed(() => clock.value - startedAt.value);

  /**
   * Milliseconds from the moment the current preview was computed to each
   * grade's resulting due date — not `previews.value[grade].due -
   * Date.now()`. A WebView backgrounded for 40 minutes between showing a
   * card and the learner pressing a button would, under a live subtraction,
   * render every button as "1 min" (40 minutes eaten out of whatever the
   * real interval was) even though the schedule itself has not moved. Bound
   * to `previewAnchor` instead, this is time-invariant for as long as the
   * anchor is; see the `visibilitychange` handler below for what keeps the
   * anchor itself from going stale over a longer background stretch.
   */
  const intervals = computed<Record<Grade, number>>(() => {
    const result = {} as Record<Grade, number>;
    for (const grade of GRADES) {
      const state = previews.value[grade];
      if (state) result[grade] = state.due - previewAnchor.value;
    }
    return result;
  });

  function stopTimer(): void {
    if (timer !== null) {
      clearInterval(timer);
      timer = null;
      if (typeof document !== 'undefined') {
        document.removeEventListener('visibilitychange', onVisibilityChange);
      }
    }
  }

  /**
   * Re-anchors the current card's preview when the page becomes visible
   * again, rather than leaving it computed against whenever the card was
   * first shown. A long background stretch is exactly the case `intervals`
   * above is bound to `previewAnchor` to survive display-wise, but the
   * *offered* schedule itself (what "Hard" vs "Good" actually computes) can
   * legitimately depend on how much time has really passed since the
   * item's last review, so it is worth recomputing, not just redisplaying.
   */
  function onVisibilityChange(): void {
    if (document.visibilityState === 'visible') void refreshCurrent();
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
      if (typeof document !== 'undefined') {
        document.addEventListener('visibilitychange', onVisibilityChange);
      }
    }
  }

  // In a real page this composable is used from a component's setup(), so
  // there is an active effect scope to tie the interval and listener's life
  // to. Outside one (e.g. a plain test) there is nothing to tie it to and
  // nothing to leak into — `failSilently` skips the dev warning for that
  // case rather than forcing every caller to wrap itself in an effectScope.
  onScopeDispose(stopTimer, true);

  /** Serialises the four mutating actions; a call made while one is already in flight is dropped. */
  async function guarded<T>(fn: () => Promise<T>, whenBusy: T): Promise<T> {
    if (busy.value) return whenBusy;
    busy.value = true;
    try {
      return await fn();
    } finally {
      busy.value = false;
    }
  }

  async function refreshCurrent(): Promise<void> {
    const item = current.value;
    if (!item) {
      card.value = null;
      previews.value = {} as Record<Grade, SrsState>;
      return;
    }
    card.value = (await cards.get(item.cardId)) ?? null;
    const settings = await loadSettings();
    const anchor = Date.now();
    previews.value = schedulerFor(settings.algorithm).preview(item, anchor, {
      desiredRetention: settings.desiredRetention,
      maxInterval: settings.maxInterval,
    });
    previewAnchor.value = anchor;
    revealed.value = false;
    shownAt.value = Date.now();
  }

  async function persist(): Promise<void> {
    await saveSession({ queueIds: queue.value.map((i) => i.id), index: index.value, startedAt: startedAt.value, log: log.value });
  }

  async function startCore(now: number): Promise<void> {
    const settings = await loadSettings();
    const due = await items.due(now);
    const introducedToday = await introducedSince(startOfDay(now));
    const fresh = await items.fresh(Math.max(0, settings.newPerDay - introducedToday));

    queue.value = buildQueue({ due, fresh, newPerDay: settings.newPerDay, introducedToday });
    index.value = 0;
    log.value = [];
    startedAt.value = now;
    started.value = true;
    await refreshCurrent();
    await persist();
    syncTimer();
  }

  async function start(now = Date.now()): Promise<void> {
    await guarded(() => startCore(now), undefined);
  }

  /**
   * Rebuilds the queue from the stored ids, re-checking each against the
   * same visibility rules `due()`/`fresh()` already apply (not suspended,
   * card and deck both still live) rather than merely whether the row still
   * exists — this app only ever soft-deletes or suspends, never removes an
   * Item row, so "does the row exist" alone would never actually exclude
   * anything a learner did mid-session.
   *
   * Also refuses to resume — and clears the stored record — a session that
   * is already finished (cursor at or past the end) or was started before
   * today (`startedAt` earlier than `startOfDay(now)`): otherwise a session
   * finished yesterday is resumed forever, since nothing else ever clears
   * it, and a fresh `start()` can never run.
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
  async function restoreCore(now: number): Promise<boolean> {
    const stored = await loadSession();
    if (!stored) return false;

    const finished = stored.index >= stored.queueIds.length;
    const stale = stored.startedAt < startOfDay(now);
    if (finished || stale) {
      await clearSession();
      return false;
    }

    const visible = await items.visible(stored.queueIds);
    const visibleIds = new Set(visible.map((i) => i.id));
    queue.value = visible;
    index.value = stored.queueIds.slice(0, stored.index).filter((id) => visibleIds.has(id)).length;
    startedAt.value = stored.startedAt;
    log.value = stored.log;
    started.value = true;
    await refreshCurrent();
    syncTimer();
    return true;
  }

  async function restore(now = Date.now()): Promise<boolean> {
    return guarded(() => restoreCore(now), false);
  }

  function reveal(): void {
    revealed.value = true;
  }

  async function gradeCore(value: Grade): Promise<void> {
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

  async function grade(value: Grade): Promise<void> {
    await guarded(() => gradeCore(value), undefined);
  }

  /**
   * Checks the item still exists *before* touching anything else, and bails
   * out — leaving the cursor, log and review row all untouched — if it is
   * gone. Moving the cursor back without a real item to put in its place
   * would show the learner whatever the queue already held there, i.e. the
   * very card they just graded, past tense — inviting a second, duplicate
   * review of it. The item is re-fetched *after* `reviews.undo()` runs,
   * not reused from this existence check: `reviews.undo()` is what writes
   * the restored (pre-review) fields onto the row, so fetching beforehand
   * would put the still-graded state into the queue instead.
   */
  async function undoCore(): Promise<void> {
    const last = log.value.at(-1);
    if (!last) return;
    if (!(await items.get(last.itemId))) return;

    await reviews.undo(last.reviewId);
    log.value = log.value.slice(0, -1);
    index.value = Math.max(0, index.value - 1);
    queue.value[index.value] = (await items.get(last.itemId))!;
    await refreshCurrent();
    revealed.value = true;
    await persist();
    syncTimer();
  }

  async function undo(): Promise<void> {
    await guarded(() => undoCore(), undefined);
  }

  return {
    queue,
    current,
    card,
    previews,
    intervals,
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
