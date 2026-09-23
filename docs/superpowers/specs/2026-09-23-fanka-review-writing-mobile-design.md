# Fanka — hanzi-first review, drawn writing, mobile pass

**Date:** 2026-09-23
**Status:** design approved in conversation; written spec awaiting review
**Parent spec:** `docs/superpowers/specs/2026-09-16-fanka-design.md`

Three changes, requested together:

1. Review shows the hanzi first; the learner recalls pinyin and meaning.
2. Writing practice is drawn on screen and checked by the app.
3. The phone layout is reworked.

Kanto now comes from npm as `kanto-ui` (committed separately, before this
work).

## 1. Review and Writing split by direction

Every card already has two items: `recognition` (字 → meaning) and
`production` (meaning → 字). Today both screens share one queue that mixes
them. From now on:

| Screen | Items | Front | Back |
| --- | --- | --- | --- |
| Review | `recognition` only | hanzi | pinyin, meaning, example |
| Writing | `production` only | meaning (pinyin hint per setting) | drawn character, checked |

**Queues.** `items.due(now, dir)` and `items.fresh(limit, dir)` take a
direction. `dueToday(now, dir)` passes it through. `buildQueue` is unchanged:
with one direction per queue, `separateDirections` has nothing to separate
and is a no-op.

**Daily allowance.** `newPerDay` applies to each direction on its own.
`introducedSince(since, dir)` counts only that direction's first reviews. A
learner with `newPerDay: 15` can therefore meet 15 new words in Review and
write 15 new words in Writing on the same day.

**Sessions.** `core/db/session.ts` stores one record per mode, under the
keys `session:review` and `session:writing` in the existing `settings`
table. The old `session` key is ignored and deleted on first load. No Dexie
version bump is needed. `loadSession(mode)`, `saveSession(mode, …)` and
`clearSession(mode)` take the mode.

`useReviewSession(mode)` takes it too and passes it to `dueToday` and the
session store. Leaving Review mid-session and opening Writing no longer
overwrites the Review cursor.

**Counts.** `useDueCounts` exposes `totals: { review, writing }` and
`byState` per mode. Its callers change as follows:

- **Navigation:** the badge moves from Today to Review and Writing, each
  showing its own count.
- **Today page:** two `kt-card`s, "Review" and "Writing". Each has its New,
  Learning and To review `kt-stat`s and its own Start button, disabled with
  its reason when nothing is due.
- **Desktop sidebar:** the "Today's session · n" button starts Review, and
  its count is the Review total.

## 2. Review card

- **Front:** the hanzi alone, large. No pinyin, no direction badge. The
  learner's state (new, learning…) stays as small muted text in the card
  header.
- **After Show answer:** tone-coloured pinyin, zhuyin when `showZhuyin` is
  on, the translation, tags, the example and the mnemonic. The hanzi stays
  on top.
- **Grades:** unchanged. There are four buttons, and the 1–4, Space and U
  shortcuts still work.
- **`hidePinyinUntilRevealed`:** now only affects Writing, where it hides
  the pinyin hint under the meaning. Its label on the settings page says
  so: "Hide the pinyin hint in writing practice".

## 3. Writing: draw, check, verdict

### Flow

1. The front shows the meaning, plus the pinyin hint unless
   `hidePinyinUntilRevealed` is on. Below it sits a square drawing pad.
2. A word of several characters is drawn one character at a time. The pad
   shows "1 / 2" and moves to the next character on Check. Each character
   gets its own verdict. The word is right only when every character is
   right.
3. Pad controls: **Undo stroke**, **Clear**, **Check**. Check is disabled
   until at least one stroke is drawn. Enter also triggers Check.
4. The verdict replaces the controls:
   - **Right:** a `success` `kt-alert` titled "Right". The model character
     is shown with the learner's strokes overlaid.
   - **Wrong:** a `danger` `kt-alert` whose title names what went wrong:
     "Wrong stroke count: 9 of 11", or "Stroke 4 doesn't match". The
     overlay shows the model's strokes, the learner's strokes, and the first
     wrong stroke in `--color-danger-*`.
   - Below the alert: the full word, its pinyin and its translation.
5. Grading is automatic. Right grades 3 (Good) and Wrong grades 1 (Again).
   The grade is recorded when the learner presses **Continue** (Enter), not
   when the verdict appears, so Undo in the page header still works the way
   it does in Review. After a Wrong verdict, a secondary **Count it as
   right** button grades 3 instead, to cover a false negative.

### Drawing pad — `app/components/HanziPad.vue`

- An inline `<svg>` with a `viewBox` of `0 0 1024 1024`, square, as wide as
  the card allows and capped so the page never scrolls sideways.
  `touch-action: none` on the pad only, so drawing does not scroll the page.
- The 米字格 guide (outer frame, both axes, both diagonals) is drawn as
  dashed lines in `--border-subtle`.
- Input comes from Pointer Events (`pointerdown` / `pointermove` /
  `pointerup` with `setPointerCapture`), so finger, stylus and mouse all
  work. Each stroke is stored as an array of points in pad coordinates and
  drawn as a polyline in `--text-body`.
- Emits plain Vue events, since it is a Fanka component, not a Kanto element:
  `strokes-change` fires with the stroke array. Undo and clear are exposed
  methods.
- `<svg>` is not on the Kanto-first watch list, so it needs no allowlist
  entry. Kanto has no drawing surface, which the component's comment says.

### Stroke check — `core/chinese/strokes.ts` (pure, tested first)

```ts
type Point = { x: number; y: number };
interface CharacterStrokes { strokes: string[]; medians: Point[][] }
interface StrokeCheck {
  correct: boolean;
  expected: number;          // stroke count of the model
  drawn: number;
  firstMismatch: number | null; // index of the first failing stroke
}
function checkCharacter(drawn: Point[][], model: CharacterStrokes): StrokeCheck;
function toModelSpace(points: Point[], padSize: number): Point[];
```

- **Coordinates.** Make Me a Hanzi medians use a 1024 box with the y axis
  pointing up and the baseline at 900. `toModelSpace` converts pad
  coordinates (y pointing down) with `y' = 900 − y`, after scaling to 1024.
  The pad hands `checkCharacter` points already in model space.
- **Rule.** A character is correct when:
  - the stroke count equals the model's, and
  - every drawn stroke *i* matches median *i*.

  Stroke order is therefore enforced by construction.
- **A stroke matches its median** when all four of these hold:
  1. **Start and end distance.** Each is within `START_END_MAX` of the
     median's start and end, so a stroke drawn backwards fails.
  2. **Shape.** After both curves are resampled to 32 evenly spaced points,
     the mean point-to-point distance is within `AVG_DIST_MAX`.
  3. **Direction.** The cosine similarity of the two overall direction
     vectors (end minus start) is above `DIRECTION_MIN`.
  4. **Length.** The drawn length is at least `LENGTH_MIN_RATIO` of the
     median's length, so a dot does not pass for a line.

  The four constants start at 250, 350, 0 and 0.35 (the values Hanzi
  Writer's quiz uses, MIT). They are tuned with the real medians in the
  tests and live as named exports so the tests can refer to them.
- **Tests** (`test/chinese/strokes.test.ts`) use real data for 學, 習, 一,
  口 and 永 checked into `test/fixtures/strokes/`. Each of these must hold:
  - the medians themselves pass,
  - the medians with jitter of ±40 pass,
  - one stroke reversed fails, and `firstMismatch` points at it,
  - two strokes swapped fails,
  - a missing stroke fails,
  - an extra stroke fails,
  - one stroke shifted by 300 fails,
  - an empty drawing fails,
  - `toModelSpace` maps the pad's corners onto the model box.

### Stroke data

- `hanzi-writer-data@2.0.1` becomes a devDependency. It holds the Make Me a
  Hanzi data, licensed under the Arphic Public License.
- `scripts/build-stroke-data.mjs` (`npm run build:stroke-data`) copies
  `strokes` and `medians` (dropping `radStrokes`) for every character
  **not** in `core/chinese/data/simplified-only.json` into
  `public/strokes/<character>.json`. It also copies `ARPHICPL.TXT` next to
  them. The output is committed, like `simplified-only.json`, so builds do
  not depend on the script.
- Expected size: a few thousand files at about 4 KB each. APK growth has to
  be measured once the output exists.
- `app/composables/useStrokeData.ts` fetches `/strokes/<c>.json`. Nuxt
  serves `public/`, and so does Capacitor's bundle. The composable caches
  results in memory for the session and returns `null` for a character
  with no data (404).

### Fallback

If any character of the word has no stroke data, that card uses the
existing flow: Show answer, then Right / Wrong (`WritingButtons`). A small
muted note explains: "No stroke data for 𠀋 — grade yourself."

## 4. Phone layout (below 900px)

### Header

`kt-header` lays its bar out as three grid columns
(`minmax(0,1fr) auto minmax(0,1fr)`). Below 900px the nav column is hidden,
so the brand, the actions and the menu button fill those three columns
instead. As a result the actions overlap the wordmark and the menu button
is not flush right.

- Fanka puts nothing in `actions` below 900px. The session button leaves
  the header; the Today page's two Start buttons replace it.
- Fanka overrides the bar through `::part(bar)`:
  `grid-template-columns: minmax(0, 1fr) auto auto`. The brand takes the
  space and the menu button sits flush right.
- The root fix belongs in Kanto (a mobile grid for the bar) and is logged
  in `docs/deferred-minors.md`.

### Page headers

- In Review and Writing, the "Session" eyebrow is dropped.
- Undo and Leave sit in `kt-page-header`'s actions slot, on the same row as
  the heading. Whether `kt-page-header` keeps them on one row at 360px has
  to be observed in a browser. If it wraps, the two icons move into the
  progress row instead.

### Review and Writing

- The page becomes a column that fills the viewport height below the
  header (`100dvh`).
- The card takes the leftover space. Its `min-height: 320px` and 48px
  padding give way to Kanto spacing tokens.
- The action area sits at the bottom of the viewport: Show answer, the
  grade buttons, Check, and Continue / Count it as right. It is
  `position: sticky; bottom: 0` on `--surface-page`, with padding for
  `env(safe-area-inset-bottom)`. The answer content scrolls under it, so
  grading never needs a scroll to reach the buttons.
- The keyboard hints (`kt-kbd`) are hidden below 900px, since a phone has no
  keyboard.

### Today

Each mode's three `kt-stat`s sit on one row.

### Browse

- Below 900px, `kt-table` shows two columns: the hanzi, and one cell with
  pinyin over translation. The column set is computed in `useBrowse` from a
  `matchMedia('(max-width: 899px)')` ref.
- Filters are full width, stacked.

### Tokens

Every new size, gap and colour comes from Kanto tokens. Where no token fits,
the value carries the usual "no matching token" comment, and the literal is
the exception, not the rule.

## 5. Testing

- **Unit, pure:**
  - `strokes.test.ts` (above);
  - `queue`/`dueToday` per direction, including the per-direction
    allowance;
  - session store per mode, including cleanup of the old key.
- **Composables:**
  - `useReviewSession('review')` never yields a production item, and the
    reverse;
  - two modes keep separate cursors;
  - `useDueCounts` returns per-mode totals.
- **E2E (Playwright):**
  - Review shows the hanzi and no pinyin before reveal.
  - Writing: drawing 一's median as a pointer path, then Check, shows
    Right; drawing it backwards shows Wrong; Continue advances.
  - At 390×844, on `/`, `/review`, `/writing`, `/browse` and `/decks`:
    - no horizontal overflow;
    - the menu button's right edge is within 24px of the viewport's right
      edge;
    - after reveal on Review, every grade button lies within the viewport
      without scrolling.
- Existing tests that assume one mixed queue are updated, not deleted.

## 6. Out of scope

- Stroke-by-stroke hints or animation of the model (Hanzi Writer's quiz
  mode).
- Recognising a character drawn without regard to stroke order.
- A bottom tab bar (the user kept the header menu).
- Fixing `kt-header` inside Kanto (logged, not done here).
