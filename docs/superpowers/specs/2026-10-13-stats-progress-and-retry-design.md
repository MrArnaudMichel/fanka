# Statistics: progress, weak points, practice that counts, writing retry — design

Date: 2026-10-13

## Why

- Statistics show a lot (four tabs, a dozen charts) but not where the learner
  stands. Nothing says how many words are known, how that grows, or what to
  do next.
- Weak points are listed ("Hardest cards", "Characters to work on") but
  nothing lets the learner act on them.
- Endless practice never touches the schedule. A new card answered ten times
  in practice stays "New": deck progress, known words, retention and hardest
  cards ignore practice entirely.
- After a writing verdict the learner cannot draw the word again; the only
  ways out are Continue and Count it as right.

## Decisions

- No daily goal. Progress is words known, milestones and the current streak.
- A word is **known** when its recognition item is in review with an interval
  of at least `MATURE_DAYS` (21) — the threshold Browse and Memory already use.
- Practice counts toward learning: the first practice answer on a **new**
  item is a real review that starts its schedule. Later practice answers stay
  off the schedule, as today.
- Writing retry: the first attempt sets the card's grade. Each retry is logged
  as a practice attempt and never changes the schedule.
- One new tab, **Overview**, opens first. The four existing tabs stay.

## Delivery

Four phases, each its own series of commits, in this order:

1. Practice that counts
2. Overview: this week, words known, milestones, insights, weak words
3. Decks, characters and focused practice
4. Writing retry

## Phase 1 — Practice that counts

`app/composables/usePracticeSession.ts`, `grade()`:

- When the current item's `state` is `'new'`, the answer goes through
  `reviews.record` (the scheduled path), so the item leaves New. The attempt
  that `record` writes is stamped `source: 'practice'`: the journal shows
  where the answer was given. `reviews.record` gains an optional `source`
  (default `'scheduled'`).
- The session replaces the item in its in-memory pool with the updated one,
  so a second answer on the same card in the same session is a plain practice
  attempt.
- Any other state: `attempts.log`, unchanged.
- Both directions: recognition (review mode) and production (writing mode).

Tests: a new item answered in practice gets one review and leaves New; a
second answer in the same session adds an attempt and no review; an item
already in review gets no review; the attempt's source is `practice`.

## Phase 2 — Overview

New pure module `core/stats/progress.ts`, tested first:

- `knownTimeline(items, reviews, cards, window, now)` → `{ known, characters,
  series: { key, known }[] }`.
  - `known`: cards whose recognition item is known now.
  - `characters`: distinct Han characters across known cards' `hanzi`.
  - `series`: known count at the end of each bucket of `timeBuckets(window)`.
    An item's interval after a review is the next review's
    `before.scheduledDays`, or the item's current `scheduledDays` after its
    last review.
- `MILESTONES = [10, 25, 50, 100, 250, 500, 1000, 2000, 5000]` and
  `milestoneProgress(known, series)` → `{ reached: number | null, reachedOn:
  string | null, next: number | null }`. `reachedOn` is the first bucket
  where `reached` was met, or null if it was met before the window.
- `weekSummary(attempts, now)` → this week (last 7 days) and the week before:
  answers, minutes (capped like Activity), days studied; plus the current
  streak from `activitySummary`.
- `weakWords(attempts, cards, window, now, limit = 5)` → cards with the most
  wrong answers in the window, scheduled and practice alike; ties broken by
  failure rate, then most recent miss. At least one wrong answer to appear.

New pure module `core/stats/insights.ts`: `insights(input)` → up to four
sentences, each emitted only when its condition holds, in this order:

1. Mature retention moved by 3 points or more between the last 30 days and the
   30 before, both with at least 20 answers: "Mature retention rose from 88 %
   to 93 % this month" / "fell from …".
2. A milestone reached in the last 7 days: "You reached 50 known words on
   Oct 9".
3. The most missed character, with at least 3 writing attempts on it: "學 is
   the character you miss most".
4. At least 30 answers in the window: "You study most around 20:00".
5. Cards due tomorrow, when more than 0: "23 cards are due tomorrow".

`app/components/stats/StatsOverview.vue`, first tab:

- **This week**: four `kt-stat` tiles (answers, minutes, days studied,
  current streak), each with its change against the week before as caption
  ("+12 % on last week"; no caption when the previous week is 0).
- **Words known**: the count, "· N characters", a line chart of `series`
  (when it has two points or more).
- **Milestones**: last reached and its date; a `kt-progress-bar` toward the
  next ("48 / 50").
- **Insights**: the sentences, each with an icon; the block is hidden when
  empty.
- **Work on these**: the weak words (hanzi, translation, wrong count) and a
  "Practise these" button (phase 3's focused practice).
- Obeys the deck filter. "This week" ignores the period; the chart obeys it.
  The mode filter applies to the week and weak words, not to words known.
- Empty state when there are no attempts and no items in review.

## Phase 3 — Decks, characters and focused practice

`core/stats/decks.ts`: `deckComparison(snapshot, decks, window, now)` → one
row per deck with words, known, learning, new, mature retention, practised
words in the window and their practice success rate. Memory gains a "Decks"
`kt-table`; a row click sets the page's deck filter.

Writing's "Characters to work on" gains two columns: words containing the
character (live cards) and the last time it was drawn right ("Never" when
not). A "Practise these" button under it practises the cards containing the
listed characters.

Focused practice:

- `/review?endless=1&cards=a,b` and `/writing?endless=1&cards=a,b`. At most
  20 ids are honoured; unknown or deleted ids are ignored.
- `usePracticeSession(mode, { cardIds })` restricts the pool to those cards'
  items in that direction (study-deck filter not applied).
- A `kt-alert` above the card: "Practising N weak words", with "Practise
  everything" dropping the parameter. An empty pool shows the existing empty
  state.

## Phase 4 — Writing retry

On the writing page, once a word is checked (`checked`):

- The first check snapshots the grade inputs: `correct`, `hintsUsed`, the
  per-character results. Continue and Count it as right always use this
  snapshot.
- `VerdictButtons` gains **Retry** (secondary, `rotate-ccw`, key `R`). It
  clears the pad and starts the same word again (`attempt.start(hanzi)`); the
  session stays revealed.
- Each retry's check logs a practice attempt (`attempts.log`, through a
  composable) with its own writing results, and shows its own verdict, with a
  line "Graded on your first try: Right" / "Wrong".
- Unlimited retries. Undo of the scheduled grade is unchanged.
- Endless practice: same button; the first attempt is already practice.

Tests: `useWritingAttempt` / page logic — Continue after a successful retry
still submits grade 1 when the first try was wrong; each retry logs one
practice attempt; e2e: Retry appears after a checked word and the pad comes
back.

## Out of scope

Daily goal, streak freeze, per-card history page beyond Browse's panel,
sharing stats.
