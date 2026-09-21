import { cards, items, reviews } from '~core/db/repositories';
import type { Card, Item } from '~core/db/schema';
import { type LogEntry, clearSession, loadSession, saveSession } from '~core/db/session';
import { loadSettings } from '~core/db/settings';
import { GRADES, type Grade, type SrsState, schedulerFor } from '~core/srs';
import { buildQueue } from '~core/srs/queue';
import { dueToday, startOfDay } from '~/composables/useDueCounts';

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
  //
  // No page shows `elapsed` yet, but the timer is not dead weight to strip:
  // `syncTimer`/`stopTimer` also add and remove the `visibilitychange`
  // listener, keyed on this same `timer`, so that listener's lifecycle
  // lives here too. Removing the interval means re-homing the listener.
  const clock = ref(Date.now());
  let timer: ReturnType<typeof setInterval> | null = null;

  /**
   * `grade`/`undo`/`start`/`restore` are serialised through this one FIFO
   * chain rather than each guarding itself independently: an undo tapped
   * the instant an unawaited grade lands, or a page's own `if (!(await
   * restore())) await start()` re-entered by a duplicate mount, must both
   * still run — in the order they were issued — not race over `queue`/
   * `index`/the persisted record. Dropping either (an earlier version of
   * this guard did) let a `restore()` return a synthetic `false` while a
   * real one was still in flight, which is exactly what let a page's own
   * `start()` clobber a restore that was about to succeed. `busy` is
   * exposed read-only so a page can disable its buttons while anything is
   * queued or running.
   */
  const busy = ref(false);
  let pendingCount = 0;
  let chainTail: Promise<unknown> = Promise.resolve();

  // Tracks the kind of whatever is currently the *tail* of the chain — the
  // most recently enqueued action that has not yet finished — so grade()
  // can tell a genuine double-tap (another grade queued right behind an
  // unfinished grade) from a grade that follows something else, most
  // importantly an undo. A plain "is any grade in flight anywhere" flag
  // cannot make that distinction: a grade queued behind an undo is a
  // correction, not a duplicate, and dropping it would silently lose the
  // learner's second (corrected) answer — the same kind of loss this whole
  // guard exists to prevent, just reached from a different call order.
  // `tailSeq` disambiguates *which* enqueue a given call belongs to, so a
  // step that finishes only resets `tailKind` back to idle if nothing else
  // was enqueued after it in the meantime.
  let tailKind: 'grade' | 'other' | null = null;
  let tailSeq = 0;

  function enqueue<T>(fn: () => Promise<T>, kind: 'grade' | 'other'): Promise<T> {
    pendingCount += 1;
    busy.value = true;
    tailSeq += 1;
    const mySeq = tailSeq;
    tailKind = kind;
    const run = chainTail.then(fn, fn);
    // Keeps the chain alive even if this step rejected, so a failure in one
    // queued action does not stall everything queued behind it.
    chainTail = run.then(
      () => undefined,
      () => undefined,
    );
    run
      .finally(() => {
        pendingCount -= 1;
        if (pendingCount === 0) busy.value = false;
        // Only clear back to idle if nothing newer has been enqueued since
        // — otherwise this would wrongly erase the *newer* tail's kind.
        if (tailSeq === mySeq) tailKind = null;
      })
      // `run`'s own rejection is the caller's to handle via the returned
      // promise; this second handler exists only so the bookkeeping above
      // does not itself produce an unhandled rejection.
      .catch(() => undefined);
    return run;
  }

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
   *
   * Calls `refreshPreview()`, not `refreshCurrent()`: the card the learner
   * was looking at, whether they had already revealed its answer, and when
   * it was shown must not change just because the phone was unlocked.
   * `refreshCurrent()` resets all three (`card`, `revealed`, `shownAt`) —
   * appropriate when a grade genuinely moves to a new card, wrong here,
   * where re-running it would hide an already-revealed answer again and
   * restart the duration a grade is about to record from the moment of
   * unlocking rather than from when the card first appeared.
   *
   * Deliberately runs outside `enqueue`'s chain — waiting behind whatever
   * is currently queued would delay redisplaying a stale preview for no
   * reason — so it is not itself serialised against a `grade()`/`undo()`
   * that moves the cursor while this is in flight. `refreshPreview()` is
   * what guards against that: it discards its own result rather than
   * writing it over a card that is no longer current by the time its
   * (awaited) work resolves.
   */
  function onVisibilityChange(): void {
    if (document.visibilityState !== 'visible') return;
    const item = current.value;
    if (!item) return;
    refreshPreview(item).catch((err: unknown) => {
      console.error('useReviewSession: failed to refresh the preview on visibilitychange', err);
    });
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

  /**
   * The scheduling half of `refreshCurrent()`, pulled out so it exists in
   * exactly one place: both a genuinely new current item and a
   * `visibilitychange` re-anchor of the *same* item need to recompute
   * `previews`/`previewAnchor` the same way, but only the former should
   * also touch `card`, `revealed` and `shownAt` — see `onVisibilityChange`.
   *
   * Re-checks that `item` is still `current.value` after its own awaited
   * work, and discards the result if not. This call runs outside the
   * `enqueue` chain (see `onVisibilityChange`), so a `grade()`/`undo()`
   * queued or running concurrently can move the cursor to a different item
   * while this is still waiting on `loadSettings()` — without the check,
   * the *new* card would end up showing the *old* card's previews once
   * this stale computation finally resolves and assigns over it.
   */
  async function refreshPreview(item: Item): Promise<void> {
    const settings = await loadSettings();
    const anchor = Date.now();
    const result = schedulerFor(settings.algorithm).preview(item, anchor, {
      desiredRetention: settings.desiredRetention,
      maxInterval: settings.maxInterval,
    });
    if (current.value?.id !== item.id) return;
    previews.value = result;
    previewAnchor.value = anchor;
  }

  async function refreshCurrent(): Promise<void> {
    const item = current.value;
    if (!item) {
      card.value = null;
      previews.value = {} as Record<Grade, SrsState>;
      return;
    }
    card.value = (await cards.get(item.cardId)) ?? null;
    await refreshPreview(item);
    revealed.value = false;
    shownAt.value = Date.now();
  }

  async function persist(): Promise<void> {
    await saveSession({ queueIds: queue.value.map((i) => i.id), index: index.value, startedAt: startedAt.value, log: log.value });
  }

  async function startCore(now: number): Promise<void> {
    const { due, fresh, introducedToday, settings } = await dueToday(now);

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
    await enqueue(() => startCore(now), 'other');
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
   * was started before today (`startedAt` earlier than `startOfDay(now)`),
   * or one with nothing left to show *after* filtering. That second check
   * is deliberately against the re-anchored cursor and the *visible* queue,
   * not the raw stored `index`/`queueIds`: a session with cards still
   * genuinely unanswered can have every one of them hidden since (a deck
   * deleted, a batch suspended) without its stored index ever reaching the
   * stored queue's length — checking the raw numbers would resume it
   * anyway, with nothing to show and `ended` already true, and — like the
   * finished-yesterday case this also covers — nothing would ever clear it.
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

    if (stored.startedAt < startOfDay(now)) {
      await clearSession();
      return false;
    }

    const visible = await items.visible(stored.queueIds);
    const visibleIds = new Set(visible.map((i) => i.id));
    const reanchoredIndex = stored.queueIds.slice(0, stored.index).filter((id) => visibleIds.has(id)).length;

    if (reanchoredIndex >= visible.length) {
      await clearSession();
      return false;
    }

    queue.value = visible;
    index.value = reanchoredIndex;
    startedAt.value = stored.startedAt;
    log.value = stored.log;
    started.value = true;
    await refreshCurrent();
    syncTimer();
    return true;
  }

  async function restore(now = Date.now()): Promise<boolean> {
    return enqueue(() => restoreCore(now), 'other');
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
    // Dropped only when the tail of the chain is itself an unfinished
    // grade — a genuine double-tap. If anything else (an undo, most
    // usefully) has been queued since, this grade is a new intent, not a
    // duplicate, and must go through even while the original grade is
    // still ahead of it in the chain.
    if (tailKind === 'grade') return;
    await enqueue(() => gradeCore(value), 'grade');
  }

  /**
   * Checks the item is still visible *before* touching anything else, and
   * bails out — leaving the queue and cursor untouched, and the review row
   * standing — if it is not. This app never removes an Item row (it only
   * soft-deletes cards/decks and suspends items), so a bare row-existence
   * check is always true and cannot catch this: `restore()` re-anchors the
   * cursor past a now-invisible item while the log still names it, and
   * writing that item back in would land on whatever unanswered card the
   * re-anchored cursor now points at, silently dropping it from the queue
   * while `total` keeps counting it. `items.visible()` applies the same
   * rules the due queue itself does, so it catches both cases. The item is
   * re-fetched *after* `reviews.undo()` runs, not reused from this
   * visibility check: `reviews.undo()` is what writes the restored
   * (pre-review) fields onto the row, so fetching beforehand would put the
   * still-graded state into the queue instead.
   */
  async function undoCore(): Promise<void> {
    const last = log.value.at(-1);
    if (!last) return;

    const [visible] = await items.visible([last.itemId]);
    if (!visible) {
      // The graded card was deleted or suspended since. Restoring it would
      // write an invisible item over whatever now sits at the cursor, so the
      // undo is dropped instead and the grade stands.
      log.value = log.value.slice(0, -1);
      await persist();
      return;
    }

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
    await enqueue(() => undoCore(), 'other');
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
    busy: readonly(busy),
    log,
    start,
    restore,
    reveal,
    grade,
    undo,
  };
}
