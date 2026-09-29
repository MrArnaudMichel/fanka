# Fanka — writing verdicts, stroke-order player, statistics and journal

**Date:** 2026-09-29
**Status:** approved; implemented
**Parent spec:** `docs/superpowers/specs/2026-09-16-fanka-design.md`

Three changes, requested together:

1. A checked drawing gets two verdicts: the **character** itself, and its
   **stroke order**. Only the character drives the schedule.
2. Once the answer is shown, a **stroke-order player** animates the model
   stroke by stroke.
3. Statistics grow into four tabs — Activity, Memory, Writing, Journal —
   fed by a new append-only log of every answer, practice included.

## Decisions

| Question | Decision |
| --- | --- |
| How the two writing verdicts affect scheduling | Character alone: right → Good (3), wrong → Again (1). Stroke order is recorded, never scheduled. "Count it as right" stays. |
| Stroke-order explainer | Animation with Replay, previous / next and an "n / total" counter. |
| Stats scope | Activity and time; memory and forecasts; writing; a filterable journal. |
| Endless practice | Logged, marked `practice`. Never touches items or reviews. Excluded from retention and forecasts. |
| Where the log lives | A new `attempts` table (approach B). `reviews` stays the scheduler's truth. |

## 1. Data: the `attempts` table

`reviews` keeps its role — exact undo and the scheduler's history — and is
not changed. Every answer, from any session, also writes one `Attempt`:

```ts
export type AttemptSource = 'scheduled' | 'practice';

export interface Attempt {
  /** Equal to the review's id for a scheduled answer; a fresh uuid for practice. */
  id: string;
  itemId: string;
  cardId: string;
  /** The card's deck at the moment of the answer; later moves do not rewrite history. */
  deckId: string;
  mode: SessionMode;          // 'review' | 'writing'
  source: AttemptSource;
  grade: Grade;
  correct: boolean;           // grade > 1
  at: number;
  durationMs: number;
  /** True when the drawing was checked by the app; false when self-graded. */
  checked: boolean;
  /** One entry per character, when `checked`; otherwise null. */
  writing: WritingResult[] | null;
}

export type WritingError = 'stroke-count' | 'stroke-shape' | 'stroke-order' | 'stroke-direction';

export interface WritingResult {
  character: string;
  shapeCorrect: boolean;
  /** False too when order could not be judged (wrong stroke count or shape). */
  orderCorrect: boolean;
  /** The first fault found, shape faults before order faults; null when both are right. */
  error: WritingError | null;
  /** Index of the model stroke at fault, or null. */
  strokeIndex: number | null;
  expected: number;
  drawn: number;
}
```

**Dexie version 3** adds `attempts: 'id, at, itemId, cardId, deckId, mode, source'`.
Its upgrade backfills one attempt per existing review: same `id`, `mode`
from the item's direction, `source: 'scheduled'`, `checked: false`,
`writing: null`, `deckId` from the card as it stands (a review whose item or
card is gone is skipped). Using the review's id means every device backfills
the same rows, so sync never duplicates them.

**Writes.**

- `reviews.record` takes the attempt's extra fields (`mode`, `checked`,
  `writing`) and writes review and attempt in the same transaction.
- `reviews.undo` deletes the attempt with the review.
- A new `attempts.log(...)` writes a practice attempt alone. No item or
  review is touched, and there is no undo.

**Sync.** Outbox entity `'attempt'`. `supabase/migrations/0002_attempts.sql`
creates an insert-only table with the same row-level policies as `reviews`,
indexed on `(user_id, at)`. A pull fetches attempts by `at`; a push upserts
with `ignoreDuplicates`. As with reviews, a local undo of an attempt that
already reached the server is not propagated — the same known hazard the
`reviews.undo` comment documents. `supabase/migrations/0002_attempts.sql`
must be applied to the Supabase project before a build off this branch
ships — `pull` queries `attempts` unconditionally, so without it every
sync fails, not just attempts.

## 2. Checker: shape and order apart

`core/chinese/strokes.ts#checkCharacter` returns:

```ts
export interface StrokeCheck {
  shapeCorrect: boolean;
  orderCorrect: boolean;
  error: WritingError | null;
  strokeIndex: number | null;
  expected: number;
  drawn: number;
  /** match[i] = model stroke matched by drawn stroke i, or null. */
  match: (number | null)[];
}
```

1. **Count.** A different stroke count is `stroke-count`: shape wrong,
   order wrong (not judgeable). `strokeIndex` is the first model stroke
   left unmatched, or the first extra one.
2. **Matching.** Each drawn stroke is compared with every model median on
   the existing tests — length, start/end distance, mean distance — plus a
   reversed comparison, so a stroke drawn backwards still matches its
   median. Pairs are taken greedily by mean distance, lowest first; on a
   tie the expected position wins. With 30 strokes at most this is cheap
   and needs no optimal assignment.
3. **Shape.** Any drawn stroke left unmatched is `stroke-shape`: shape
   wrong, order wrong. `strokeIndex` is the model stroke it should have
   been, taken as the first unmatched median.
4. **Order.** All matched but `match` is not the identity: shape right,
   `stroke-order`, `strokeIndex` the first model stroke drawn out of turn.
   All in place but one or more drawn backwards: shape right,
   `stroke-direction`, `strokeIndex` the first reversed one.
5. Otherwise both right, `error: null`.

A word is right when every character's shape is right. Its order is right
when every character's order is right.

**Tests first**, in `test/chinese/strokes.test.ts`, on the existing
fixtures (一 十 口 學 永 習), built from the medians themselves: identity
passes both; two strokes swapped → shape right, order wrong; one median
reversed → `stroke-direction`; a stroke dropped → `stroke-count`; a stroke
moved far off → `stroke-shape`.

**Player geometry**, also pure and tested, in the same module:
`strokeOrderFrames(model)` returns, per stroke, the median as a y-down
polyline, its length (for the dash animation) and the anchor for its
number (the median's first point).

## 3. Writing screen

**After Check.** `WritingVerdict.vue` (new, lifted out of `writing.vue`):

- Two compact `kt-alert`s:
  - *Character*: "Right", "Wrong stroke count, 7 of 8" or "Stroke 3
    doesn't match".
  - *Stroke order*: "Right", "Stroke 4 drawn out of order", "Stroke 2
    drawn backwards" or "Not checked".
  - In a word, each alert names the character at fault ("學: …"), as today.
- The existing overlays stay. The stroke at fault is drawn in danger for a
  shape fault, in warning for an order fault.
- `StrokeOrderPlayer` sits below them.

The buttons do not change. Continue grades 3 or 1 from the character
verdict; "Count it as right" appears when the character is wrong. On
Continue the page passes the per-character `WritingResult`s to the session,
which records them on the attempt.

**`StrokeOrderPlayer.vue`** (new), one character at a time, with a
`kt-segmented-control` over the characters of a multi-character word:

- The model in `--border-field`. Each stroke fills in its writing direction:
  a thick polyline along its median, its `stroke-dashoffset` animated from
  the median's length to 0, clipped to the stroke's outline.
- The stroke's number at its start point.
- Controls, all `kt-button`: Replay, previous, a mono "3 / 8", next.
  - It plays once on mount.
  - Previous or next pauses it and steps one stroke.
  - The learner's faulty stroke is highlighted when reached.
- Timing uses `--duration-*` tokens only. Kanto sets them to `0s` under
  `prefers-reduced-motion`, so nothing animates there: Replay shows the whole
  character, and previous / next still step one stroke at a time.
- Drawn in SVG, like `StrokeOverlay`. The integrity test does not watch
  SVG, so no allowlist entry is needed.

**Self-graded answers** (after an undo, or no check). When stroke data
exists, the player shows under the revealed answer. Otherwise nothing
changes.

**Practice.** The same screen. On Continue or Right / Wrong,
`usePracticeSession.grade` calls `attempts.log` with `source: 'practice'`
and the writing results when checked. Review-mode practice logs too, with
`writing: null`.

## 4. Statistics

**Layers.**

- `core/stats/` holds pure functions from rows to aggregates, with no Dexie
  import, each tested on fixtures.
- `core/db/repositories.ts#stats` reads the tables for a window and a deck
  filter, and calls them.
- `useStats` exposes one loader per tab.
- `/stats` becomes `kt-tabs` with four tabs, sharing a window control
  (`kt-segmented-control`: 7 d, 30 d, 90 d, 1 y, All), a deck filter
  (`kt-select`, one deck or all — Kanto's select has no multiple mode) and a
  mode filter (`kt-segmented-control`: All, Review, Writing).

Each tab shows a `kt-skeleton` while loading, its own `kt-empty-state` when
there is nothing to show, and an error state with Retry, as today.

### Activity (all attempts)

- `kt-stat` tiles: current streak, best streak, days studied, total time,
  average time per answer, answers per study day.
- A year calendar, one square per day, shaded by answer count. Kanto has no
  heatmap, so this is a hand-built SVG (`ActivityCalendar.vue`); its
  doc comment says why. Colours come from ramp tokens through semantic
  aliases. No native interactive element: each day's count is an SVG
  `title`, which a tooltip per day (371 Kanto elements) would only
  duplicate at a much higher cost.
- Time studied per day: stacked bars, scheduled and practice.
- Answers by hour of day: bars.
- Answers by mode, review and writing: doughnut.

### Memory (scheduled attempts, live items)

- True retention: the share of correct answers on items that were in
  `review` state before the answer (from `reviews.before`), split young
  (interval ≤ 21 d) and mature. Weekly lines, plus a tile for the window.
- Forecast: items due per day for the next 30 days (bars), overdue counted
  on day 0.
- Current intervals: bars over the buckets 1 d, 2–3 d, 4–7 d, 8–14 d,
  15–30 d, 1–3 mo, over 3 mo.
- Card states and answer mix, as today, with a direction switch.
- Hardest cards: a `kt-table` sorted by lapses, then failure rate. A row
  opens the card.

### Writing (writing attempts, both sources, filterable)

- Tiles: character accuracy, stroke-order accuracy, share of answers
  checked by the app.
- Character and stroke-order accuracy per week: two lines.
- Error types: count, shape, order, direction (doughnut).
- Most-missed characters: a `kt-table` with character, attempts, shape %,
  order %, last error. A row opens that character's `StrokeOrderPlayer` in
  a `kt-side-panel`.

### Journal

- `kt-table`, paged by its own `page-size`, newest first. Columns: when, hanzi,
  deck, mode, source, grade, duration, writing verdicts.
- Filters: mode, source, result (right / wrong), deck, and the shared
  window.
- A row opens the card.

The card's detail panel in Browse (`CardDetailPanel`) builds its history
from the attempts table, so practice answers and writing verdicts show there
too. A row in Hardest cards or the Journal opens the card's page
(`/cards/<id>`).

**Performance.** The page reads one snapshot of attempts, reviews, items,
cards and decks when it opens; every filter change recomputes in memory from
it. Streaks and the year calendar need the whole history anyway. At one
learner's scale — tens of thousands of rows — no cache is needed.

**Time.** A single answer counts for at most 60 seconds in time totals, so a
card left on screen during a break does not inflate study time.

## Testing

- `core/chinese/strokes`: matching, the five verdict cases, player frames.
- `core/stats`: each aggregate on fixtures — streaks across a gap and across
  DST, retention young and mature, forecast with overdue, interval buckets,
  writing accuracies, error mix, missed characters, journal filters.
- `core/db`: record writes both rows, undo deletes both, practice logs
  alone, the v3 backfill (ids match the reviews, orphans skipped).
- `core/sync`: attempts push and pull, duplicates ignored.
- Composables: `usePracticeSession` logs, `useReviewSession` passes the
  writing results through.
- The integrity test stays green: no new native interactive element.

## Out of scope

- Scheduling stroke order as a skill of its own.
- Propagating an undo of an already-synced attempt to the server.
- Exporting the journal.
