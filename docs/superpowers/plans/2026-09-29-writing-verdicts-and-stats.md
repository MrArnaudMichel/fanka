# Writing verdicts, stroke-order player and statistics — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Give a checked drawing two verdicts (character, stroke order), animate the stroke order once the answer is shown, and turn Statistics into four tabs fed by a new append-only log of every answer.

**Architecture:** The checker in `core/chinese/strokes` matches strokes independently of order, then judges order. Every answer writes an `Attempt` row (new Dexie table, synced), next to the untouched `reviews` table that stays the scheduler's truth. Pure aggregate functions in `core/stats` turn one snapshot of the tables into each tab's figures; the page reaches the database only through `useStats`.

**Tech Stack:** Nuxt 4 / Vue 3.5, Dexie 4 (fake-indexeddb in tests), Vitest 3, Kanto (`kanto-ds`) web components, Supabase.

**Spec:** `docs/superpowers/specs/2026-09-29-writing-verdicts-and-stats-design.md`

## Global Constraints

- Commits are authored by Arnaud Michel alone. **No `Co-Authored-By` trailer, no AI attribution**, in any commit.
- All copy is English, sentence case, terse, no emoji.
- Never hard-code a colour, size, duration or radius: Kanto tokens, semantic aliases first. SVG viewBox units (the 1024 box) are geometry, not sizes, and are fine — say so in a comment as `StrokeOverlay` does.
- Kanto data goes in as properties (`:columns`, `:series`, `:renderCell` camelCase for function props), events are `kt-*` with the payload in `detail`.
- `core/srs`, `core/chinese` and `core/stats` are pure: no Vue, Nuxt, Dexie or Capacitor imports. Type-only imports from `~core/db/schema` are allowed in `core/stats`.
- Pages never import `~core/db` (the integrity test enforces it) — only composables do.
- Before any new interface element, use a Kanto component. A native `button`, `a`, `nav`, `table`, `input`, `select`, `textarea`, `dialog`, `ul` or `ol` in `app/` needs an allowlist entry (`test/integrity/native-elements.allowlist.ts`). SVG is not watched.
- Traditional characters only in content and fixtures.
- Only the character verdict drives the schedule: right → grade 3, wrong → grade 1. Stroke order is recorded, never scheduled.
- Practice attempts never touch `items` or `reviews`.
- Minor findings go to `docs/deferred-minors.md`.
- Run `npm test` and `npm run typecheck` before every commit.

## Review Focus

1. **A word with several characters where one has an order fault and another a shape fault** — the character verdict must be wrong (grade 1) and the order verdict must name the order fault, not say "Not checked". Pinned in Task 6 (`writingVerdict.test.ts`).
2. **A card left on screen for an hour** — study time must not jump by an hour. Pinned in Task 8 (`MAX_ANSWER_MS` cap test).
3. **Upgrading a device that already has reviews, then syncing a second device that did the same** — no duplicate attempts on the server or locally. Pinned in Task 2 (backfill ids equal review ids) and Task 3 (pulled attempt with a known id is left alone).
4. **Undo right after a writing grade** — the attempt disappears from stats and journal along with the review. Pinned in Task 2.
5. **Stats page with a deleted card or deck in the history** — the journal still lists the answer (hanzi shown, deck "—" if gone) and nothing throws. Pinned in Task 10 (`journalRows` with a missing deck).

---

## File map

| File | Responsibility |
| --- | --- |
| `core/chinese/strokes.ts` | Checker: order-independent matching, shape and order verdicts; `strokeOrderFrames` |
| `core/db/schema.ts` | `Attempt`, `WritingResult`, `AttemptDetail`, `StudyMode`, `DIRECTION_MODE`; outbox entity `'attempt'` |
| `core/db/attempts.ts` (new) | Pure builders: `buildAttempt`, `attemptFromReview` |
| `core/db/db.ts` | Dexie v3: `attempts` store + backfill |
| `core/db/repositories.ts` | `reviews.record/undo` write/delete attempts; `attempts` repo; `stats.snapshot` replaces `stats.summary` |
| `core/sync/*`, `supabase/migrations/0002_attempts.sql` | Attempts sync |
| `app/composables/useWritingAttempt.ts` | `results`, `firstOrderFault` |
| `app/composables/useReviewSession.ts`, `usePracticeSession.ts` | `grade(value, detail)`; practice logs attempts |
| `app/composables/useStrokeOrderPlayer.ts` (new) | Player state machine |
| `app/components/StrokeOrderPlayer.vue`, `StrokeOrderPanel.vue`, `WritingVerdict.vue` (new) | Player, multi-character wrapper, two verdicts |
| `app/utils/writingVerdict.ts` (new) | Verdict copy |
| `core/stats/time.ts`, `filter.ts`, `activity.ts`, `memory.ts`, `writing.ts`, `journal.ts`, `index.ts` (new) | Pure aggregates |
| `app/composables/useStats.ts` | Snapshot, filter, filtered view |
| `app/pages/stats.vue` + `app/components/stats/*.vue` (new) | Tabs |
| `app/components/CardDetailPanel.vue`, `CardTable.vue`, `app/composables/useBrowse.ts` | History from attempts |

---

### Task 1: Checker — shape and order apart

**Files:**
- Modify: `core/chinese/strokes.ts`
- Modify: `app/composables/useWritingAttempt.ts` (two computeds), `app/components/StrokeOverlay.vue`, `app/pages/writing.vue` (`verdictHeading` only)
- Test: `test/chinese/strokes.test.ts`, `test/composables/useWritingAttempt.test.ts`

**Interfaces:**
- Produces:
  ```ts
  export type WritingError = 'stroke-count' | 'stroke-shape' | 'stroke-order' | 'stroke-direction';
  export interface StrokeCheck {
    shapeCorrect: boolean; orderCorrect: boolean; error: WritingError | null;
    strokeIndex: number | null; expected: number; drawn: number;
    match: (number | null)[]; reversed: boolean[];
  }
  export function checkCharacter(drawn: Point[][], model: CharacterStrokes): StrokeCheck;
  export interface StrokeFrame { median: Point[]; length: number; start: Point }
  export function strokeOrderFrames(model: CharacterStrokes): StrokeFrame[];
  ```
  `StrokeCheck.correct` and `firstMismatch` are removed.

- [ ] **Step 1: Rewrite the checker tests**

In `test/chinese/strokes.test.ts`, replace the whole `describe('checkCharacter', …)` block with the block below, and add `strokeOrderFrames` to the import from `~core/chinese/strokes`. Keep the helpers (`traced`, `densify`, `jitter`) and the `toModelSpace` block.

```ts
describe('checkCharacter', () => {
  it.each(Object.keys(MODELS))('accepts %s traced along its own medians', (character) => {
    const model = MODELS[character]!;
    const n = model.medians.length;
    expect(checkCharacter(traced(model), model)).toEqual({
      shapeCorrect: true,
      orderCorrect: true,
      error: null,
      strokeIndex: null,
      expected: n,
      drawn: n,
      match: Array.from({ length: n }, (_, i) => i),
      reversed: Array.from({ length: n }, () => false),
    });
  });

  it.each(Object.keys(MODELS))('accepts %s drawn with a shaky hand', (character) => {
    const model = MODELS[character]!;
    expect(checkCharacter(jitter(traced(model), 40), model)).toMatchObject({ shapeCorrect: true, orderCorrect: true });
  });

  it('accepts the shape of a stroke drawn backwards, and faults its direction', () => {
    const strokes = traced(MODELS.永!);
    strokes[2] = [...strokes[2]!].reverse();
    expect(checkCharacter(strokes, MODELS.永!)).toMatchObject({
      shapeCorrect: true,
      orderCorrect: false,
      error: 'stroke-direction',
      strokeIndex: 2,
    });
  });

  it('accepts the shape of two strokes swapped, and faults their order', () => {
    const strokes = traced(MODELS.十!);
    expect(checkCharacter([strokes[1]!, strokes[0]!], MODELS.十!)).toMatchObject({
      shapeCorrect: true,
      orderCorrect: false,
      error: 'stroke-order',
      strokeIndex: 0,
      match: [1, 0],
    });
  });

  it('faults order before direction when both are wrong', () => {
    const strokes = traced(MODELS.十!);
    expect(checkCharacter([[...strokes[1]!].reverse(), strokes[0]!], MODELS.十!)).toMatchObject({
      shapeCorrect: true,
      error: 'stroke-order',
    });
  });

  it('finds the order fault further into a character', () => {
    // 永's last two strokes fall left and right: distinct enough that
    // swapping them can never pass as the model order.
    const strokes = traced(MODELS.永!);
    [strokes[3], strokes[4]] = [strokes[4]!, strokes[3]!];
    expect(checkCharacter(strokes, MODELS.永!)).toMatchObject({ shapeCorrect: true, error: 'stroke-order', strokeIndex: 3 });
  });

  it('rejects a missing stroke, points at it and reports the counts', () => {
    const strokes = traced(MODELS.口!).slice(0, -1);
    expect(checkCharacter(strokes, MODELS.口!)).toMatchObject({
      shapeCorrect: false,
      orderCorrect: false,
      error: 'stroke-count',
      strokeIndex: 2,
      expected: 3,
      drawn: 2,
    });
  });

  it('rejects an extra stroke', () => {
    const strokes = traced(MODELS.一!);
    expect(checkCharacter([...strokes, strokes[0]!], MODELS.一!)).toMatchObject({
      shapeCorrect: false,
      error: 'stroke-count',
      strokeIndex: null,
      expected: 1,
      drawn: 2,
    });
  });

  it('rejects a stroke drawn in the wrong place and points at it', () => {
    const strokes = traced(MODELS.學!);
    strokes[5] = strokes[5]!.map((p) => ({ x: p.x + 300, y: p.y - 300 }));
    expect(checkCharacter(strokes, MODELS.學!)).toMatchObject({ shapeCorrect: false, error: 'stroke-shape', strokeIndex: 5 });
  });

  it('rejects a dot where a line is expected', () => {
    const [median] = MODELS.一!.medians;
    const [x, y] = median![0]!;
    expect(checkCharacter([[{ x, y }, { x: x + 10, y }]], MODELS.一!)).toMatchObject({ shapeCorrect: false, error: 'stroke-shape' });
  });

  it('rejects an empty drawing', () => {
    expect(checkCharacter([], MODELS.一!)).toMatchObject({ shapeCorrect: false, error: 'stroke-count', strokeIndex: 0, drawn: 0 });
  });

  it('rejects 口 drawn as 十', () => {
    expect(checkCharacter(traced(MODELS.十!), MODELS.口!).shapeCorrect).toBe(false);
  });
});

describe('strokeOrderFrames', () => {
  it('gives each stroke its median in the y-down box, its length and its start', () => {
    const model = MODELS.十!;
    const frames = strokeOrderFrames(model);
    expect(frames).toHaveLength(2);
    const [x, y] = model.medians[0]![0]!;
    expect(frames[0]!.start).toEqual({ x, y: 900 - y });
    expect(frames[0]!.median).toHaveLength(model.medians[0]!.length);
    expect(frames[0]!.length).toBeGreaterThan(100);
  });
});
```

- [ ] **Step 2: Run to see them fail**

Run: `npx vitest run test/chinese/strokes.test.ts`
Expected: FAIL (`shapeCorrect` missing, `strokeOrderFrames` not exported).

- [ ] **Step 3: Implement**

In `core/chinese/strokes.ts`:

1. Update the module doc comment's second paragraph to: "A drawing's *shape* is right when it has the same number of strokes and every drawn stroke follows a distinct median, in either direction. Its *order* is right when stroke *i* follows median *i*, forwards."
2. Replace `StrokeCheck` and `checkCharacter` with:

```ts
export type WritingError = 'stroke-count' | 'stroke-shape' | 'stroke-order' | 'stroke-direction';

export interface StrokeCheck {
  /** Right number of strokes, each following a distinct median, whatever the order. */
  shapeCorrect: boolean;
  /** Stroke i follows median i, forwards. False whenever the shape is wrong. */
  orderCorrect: boolean;
  /** The first fault: shape faults before order faults, order before direction. */
  error: WritingError | null;
  /** The model stroke at fault, or `null` (none, or an extra stroke). */
  strokeIndex: number | null;
  /** Stroke count of the model. */
  expected: number;
  drawn: number;
  /** match[i]: the model stroke drawn stroke i follows, or `null`. */
  match: (number | null)[];
  /** reversed[i]: drawn stroke i follows its median backwards. */
  reversed: boolean[];
}

interface Fit {
  cost: number;
  reversed: boolean;
}

/** How well a stroke follows a median, trying both directions; `null` when neither passes. */
function fit(stroke: Point[], median: Point[]): Fit | null {
  const forward = strokeCost(stroke, median);
  const backward = strokeCost([...stroke].reverse(), median);
  if (forward === null && backward === null) return null;
  if (backward === null || (forward !== null && forward <= backward)) return { cost: forward!, reversed: false };
  return { cost: backward, reversed: true };
}

export function checkCharacter(drawn: Point[][], model: CharacterStrokes): StrokeCheck {
  const expected = model.medians.length;
  const medians = model.medians.map((median) => median.map(([x, y]) => ({ x, y })));
  const match: (number | null)[] = drawn.map(() => null);
  const reversed: boolean[] = drawn.map(() => false);

  // Fast path: stroke i follows median i. Keeps a correct drawing's verdict
  // independent of how the greedy pass below would break near-ties.
  const identity = drawn.length === expected ? drawn.map((stroke, i) => fit(stroke, medians[i]!)) : [];
  if (drawn.length === expected && identity.every((f) => f !== null)) {
    identity.forEach((f, i) => {
      match[i] = i;
      reversed[i] = f!.reversed;
    });
  } else {
    // Greedy assignment, cheapest pair first; on equal cost, the pair
    // closer to its expected position wins. At most ~30 strokes, so the
    // n² pairs are cheap and an optimal assignment is not worth it.
    const pairs: { i: number; j: number; cost: number; reversed: boolean }[] = [];
    drawn.forEach((stroke, i) =>
      medians.forEach((median, j) => {
        const f = fit(stroke, median);
        if (f) pairs.push({ i, j, cost: f.cost, reversed: f.reversed });
      }),
    );
    pairs.sort((a, b) => a.cost - b.cost || Math.abs(a.i - a.j) - Math.abs(b.i - b.j));
    const used = new Set<number>();
    for (const p of pairs) {
      if (match[p.i] !== null || used.has(p.j)) continue;
      match[p.i] = p.j;
      reversed[p.i] = p.reversed;
      used.add(p.j);
    }
  }

  const used = new Set(match.filter((j): j is number => j !== null));
  const firstUnmatchedMedian = medians.findIndex((_, j) => !used.has(j));
  const base = { expected, drawn: drawn.length, match, reversed };

  if (drawn.length !== expected) {
    return { ...base, shapeCorrect: false, orderCorrect: false, error: 'stroke-count', strokeIndex: firstUnmatchedMedian === -1 ? null : firstUnmatchedMedian };
  }
  if (match.some((j) => j === null)) {
    return { ...base, shapeCorrect: false, orderCorrect: false, error: 'stroke-shape', strokeIndex: firstUnmatchedMedian };
  }
  const outOfTurn = match.findIndex((j, i) => j !== i);
  if (outOfTurn !== -1) {
    return { ...base, shapeCorrect: true, orderCorrect: false, error: 'stroke-order', strokeIndex: outOfTurn };
  }
  const backwards = reversed.findIndex(Boolean);
  if (backwards !== -1) {
    return { ...base, shapeCorrect: true, orderCorrect: false, error: 'stroke-direction', strokeIndex: backwards };
  }
  return { ...base, shapeCorrect: true, orderCorrect: true, error: null, strokeIndex: null };
}
```

3. Replace `strokeMatches` with `strokeCost` — same tests, returning the mean distance instead of a boolean:

```ts
/** The mean distance between stroke and median, or `null` when a test fails. */
function strokeCost(stroke: Point[], median: Point[]): number | null {
  if (stroke.length === 0 || median.length === 0) return null;
  if (length(stroke) < length(median) * LENGTH_MIN_RATIO) return null;
  if (distance(stroke[0]!, median[0]!) > START_END_MAX) return null;
  if (distance(stroke.at(-1)!, median.at(-1)!) > START_END_MAX) return null;
  if (cosine(direction(stroke), direction(median)) < DIRECTION_MIN) return null;
  const a = resample(stroke, RESAMPLE_POINTS);
  const b = resample(median, RESAMPLE_POINTS);
  const mean = a.reduce((sum, p, i) => sum + distance(p, b[i]!), 0) / RESAMPLE_POINTS;
  return mean <= AVG_DIST_MAX ? mean : null;
}
```

4. Append:

```ts
export interface StrokeFrame {
  /** The median in the y-down 1024 box, in writing order. */
  median: Point[];
  /** Its length, for a dash animation that draws it. */
  length: number;
  /** Where the stroke starts — where its number goes. */
  start: Point;
}

/** What the stroke-order player draws, per stroke. */
export function strokeOrderFrames(model: CharacterStrokes): StrokeFrame[] {
  return model.medians.map((m) => {
    const median = toPadSpace(m.map(([x, y]) => ({ x, y })));
    return { median, length: length(median), start: median[0]! };
  });
}
```

- [ ] **Step 4: Adapt the three consumers so the build stays green**

`app/composables/useWritingAttempt.ts`:

```ts
  const correct = computed(() => status.value === 'checked' && attempts.value.every((a) => a.check.shapeCorrect));
  const firstWrong = computed(() => attempts.value.find((a) => !a.check.shapeCorrect) ?? null);
```

`app/components/StrokeOverlay.vue` — script:

```ts
const at = computed(() => props.attempt.check.strokeIndex);
const shapeWrong = computed(() => !props.attempt.check.shapeCorrect);
const orderWrong = computed(() => props.attempt.check.shapeCorrect && !props.attempt.check.orderCorrect);
const label = computed(() => `${props.attempt.character}: ${props.attempt.check.shapeCorrect ? 'right' : 'wrong'}`);
```

template path:

```html
      <path
        v-for="(d, i) in attempt.model.strokes"
        :key="i"
        :d="d"
        class="model"
        :class="{ wrong: shapeWrong && i === at, order: orderWrong && i === at }"
      />
```

style: add `.model.order { fill: var(--color-warning-base); }`. Update the doc comment: "the first model stroke at fault — in the danger colour for a shape fault, in the warning colour for an order fault".

`app/pages/writing.vue` — in `verdictHeading`, replace the destructuring and last line:

```ts
  const { drawn: count, expected, strokeIndex } = wrong.check;
  if (count !== expected) return `${prefix}wrong stroke count, ${count} of ${expected}`;
  return `${prefix}stroke ${(strokeIndex ?? 0) + 1} doesn't match`;
```

(Task 6 replaces this heading entirely.)

- [ ] **Step 5: Add an order-fault case to `useWritingAttempt`'s tests**

In `test/composables/useWritingAttempt.test.ts`, add:

```ts
  it('counts a character with its strokes out of order as right', async () => {
    const attempt = useWritingAttempt(load);
    await attempt.start('十');
    const [a, b] = drawn(DATA.十!);
    attempt.submit([b!, a!]);
    expect(attempt.correct.value).toBe(true);
  });
```

- [ ] **Step 6: Run the suite and typecheck**

Run: `npm test && npm run typecheck`
Expected: PASS.

- [ ] **Step 7: Commit**

```bash
git add core/chinese/strokes.ts test/chinese/strokes.test.ts app/composables/useWritingAttempt.ts test/composables/useWritingAttempt.test.ts app/components/StrokeOverlay.vue app/pages/writing.vue
git commit -m "Judge a drawing's shape apart from its stroke order"
```

---

### Task 2: The `attempts` table

**Files:**
- Modify: `core/db/schema.ts`, `core/db/db.ts`, `core/db/repositories.ts`
- Create: `core/db/attempts.ts`
- Test: `test/db/attempts.test.ts` (new), `test/db/migration-v3.test.ts` (new)

**Interfaces:**
- Consumes: `WritingError` from Task 1.
- Produces (in `core/db/schema.ts`):
  ```ts
  export type StudyMode = 'review' | 'writing';
  export const DIRECTION_MODE: Record<Direction, StudyMode>;
  export type AttemptSource = 'scheduled' | 'practice';
  export interface WritingResult { character: string; shapeCorrect: boolean; orderCorrect: boolean; error: WritingError | null; strokeIndex: number | null; expected: number; drawn: number }
  export interface AttemptDetail { checked: boolean; writing: WritingResult[] | null }
  export const SELF_GRADED: AttemptDetail;
  export interface Attempt extends AttemptDetail { id; itemId; cardId; deckId; mode: StudyMode; source: AttemptSource; grade: Grade; correct: boolean; at: number; durationMs: number }
  ```
  In `core/db/repositories.ts`: `RecordedReview.detail?: AttemptDetail`; `attempts.log(entry: LoggedAttempt): Promise<string>`; `attempts.forCard(cardId): Promise<Attempt[]>` (oldest first); `export interface LoggedAttempt { item: Item; grade: Grade; at: number; durationMs: number; detail: AttemptDetail }`.

- [ ] **Step 1: Write the failing repository tests**

`test/db/attempts.test.ts`:

```ts
import 'fake-indexeddb/auto';
import { beforeEach, describe, expect, it } from 'vitest';
import { db } from '~core/db/db';
import { attempts, cards, decks, items, reviews } from '~core/db/repositories';
import { type WritingResult, SELF_GRADED, itemId } from '~core/db/schema';

const NOW = Date.parse('2026-09-16T08:00:00Z');

const aDeck = { id: 'd1', name: 'HSK 1', description: '', colorToken: 'var(--chart-series-1)', tag: '', translationLang: 'en', createdAt: NOW, updatedAt: NOW, deletedAt: null };
const aCard = { id: 'c1', deckId: 'd1', hanzi: '十', pinyin: [{ text: 'shí', tone: 2 as const }], zhuyin: '', translation: 'ten', pos: 'noun' as const, example: '', examplePinyin: '', exampleTranslation: '', tags: [], note: '', createdAt: NOW, updatedAt: NOW, deletedAt: null };
const WRITING: WritingResult[] = [{ character: '十', shapeCorrect: true, orderCorrect: false, error: 'stroke-order', strokeIndex: 0, expected: 2, drawn: 2 }];

beforeEach(async () => {
  await db.delete();
  await db.open();
  await decks.put(aDeck);
  await cards.create(aCard, ['recognition', 'production'], NOW);
});

async function production() {
  return (await items.get(itemId('c1', 'production')))!;
}

describe('reviews.record', () => {
  it('writes an attempt with the review, under the same id', async () => {
    const item = await production();
    const id = await reviews.record({ item, before: item, grade: 3, reviewedAt: NOW, durationMs: 4000, detail: { checked: true, writing: WRITING } });
    expect(await db.attempts.get(id)).toEqual({
      id, itemId: item.id, cardId: 'c1', deckId: 'd1', mode: 'writing', source: 'scheduled',
      grade: 3, correct: true, at: NOW, durationMs: 4000, checked: true, writing: WRITING,
    });
    expect((await db.outbox.toArray()).filter((e) => e.entity === 'attempt').map((e) => e.entityId)).toEqual([id]);
  });

  it('records a self-graded answer when no detail is given', async () => {
    const item = (await items.get(itemId('c1', 'recognition')))!;
    const id = await reviews.record({ item, before: item, grade: 1, reviewedAt: NOW, durationMs: 1000 });
    expect(await db.attempts.get(id)).toMatchObject({ mode: 'review', correct: false, ...SELF_GRADED });
  });
});

describe('reviews.undo', () => {
  it('deletes the attempt with the review', async () => {
    const item = await production();
    const id = await reviews.record({ item, before: item, grade: 3, reviewedAt: NOW, durationMs: 1000 });
    await reviews.undo(id);
    expect(await db.attempts.get(id)).toBeUndefined();
    expect((await db.outbox.toArray()).some((e) => e.entity === 'attempt' && e.op === 'delete' && e.entityId === id)).toBe(true);
  });
});

describe('attempts.log', () => {
  it('logs a practice answer without touching items or reviews', async () => {
    const item = await production();
    const id = await attempts.log({ item, grade: 1, at: NOW, durationMs: 2000, detail: { checked: true, writing: WRITING } });
    expect(await db.attempts.get(id)).toMatchObject({ source: 'practice', mode: 'writing', correct: false, deckId: 'd1' });
    expect(await db.reviews.count()).toBe(0);
    expect(await production()).toEqual(item);
  });
});

describe('attempts.forCard', () => {
  it('returns every answer on the card, oldest first', async () => {
    const item = await production();
    await attempts.log({ item, grade: 3, at: NOW + 10, durationMs: 1, detail: SELF_GRADED });
    await attempts.log({ item, grade: 1, at: NOW, durationMs: 1, detail: SELF_GRADED });
    expect((await attempts.forCard('c1')).map((a) => a.at)).toEqual([NOW, NOW + 10]);
  });
});
```

`test/db/migration-v3.test.ts`:

```ts
import 'fake-indexeddb/auto';
import Dexie from 'dexie';
import { describe, expect, it } from 'vitest';
import { db } from '~core/db/db';

const NOW = Date.parse('2026-09-16T08:00:00Z');
const before = { state: 'new', due: NOW, stability: 0, difficulty: 0, elapsedDays: 0, scheduledDays: 0, reps: 0, lapses: 0, learningSteps: 0, lastReview: null, updatedAt: NOW };

describe('Dexie version 3', () => {
  it('backfills one attempt per review, under the review id, and queues them for sync', async () => {
    db.close();
    await Dexie.delete('fanka');
    const legacy = new Dexie('fanka');
    legacy.version(2).stores({
      decks: 'id, updatedAt, deletedAt',
      cards: 'id, deckId, updatedAt, deletedAt, *tags',
      items: 'id, cardId, dir, due, state, suspended, updatedAt',
      reviews: 'id, itemId, reviewedAt',
      strokes: 'char',
      settings: 'key',
      outbox: 'id, entity, entityId, at',
      syncState: 'key',
    });
    await legacy.open();
    await legacy.table('cards').put({ id: 'c1', deckId: 'd1' });
    await legacy.table('items').put({ id: 'c1:production', cardId: 'c1', dir: 'production' });
    await legacy.table('reviews').bulkPut([
      { id: 'r1', itemId: 'c1:production', grade: 3, reviewedAt: NOW, durationMs: 5000, before },
      { id: 'orphan', itemId: 'gone:recognition', grade: 1, reviewedAt: NOW, durationMs: 1, before },
    ]);
    legacy.close();

    await db.open();

    expect(await db.attempts.toArray()).toEqual([
      { id: 'r1', itemId: 'c1:production', cardId: 'c1', deckId: 'd1', mode: 'writing', source: 'scheduled', grade: 3, correct: true, at: NOW, durationMs: 5000, checked: false, writing: null },
    ]);
    expect((await db.outbox.toArray()).map((e) => [e.entity, e.entityId, e.op])).toEqual([['attempt', 'r1', 'put']]);
  });
});
```

- [ ] **Step 2: Run to see them fail**

Run: `npx vitest run test/db/attempts.test.ts test/db/migration-v3.test.ts`
Expected: FAIL (`attempts` not exported, `db.attempts` undefined).

- [ ] **Step 3: Schema**

In `core/db/schema.ts`, add `import type { WritingError } from '~core/chinese/strokes';` and, after `Review`:

```ts
/** Which screen an answer came from: Review asks recognition, Writing production. */
export type StudyMode = 'review' | 'writing';

export const DIRECTION_MODE: Record<Direction, StudyMode> = { recognition: 'review', production: 'writing' };

/** A scheduled answer moved an item; a practice answer did not. */
export type AttemptSource = 'scheduled' | 'practice';

/** The checker's verdict on one drawn character. */
export interface WritingResult {
  character: string;
  shapeCorrect: boolean;
  /** False too when the order could not be judged (wrong stroke count or shape). */
  orderCorrect: boolean;
  error: WritingError | null;
  strokeIndex: number | null;
  expected: number;
  drawn: number;
}

/** How an answer was judged: by the app from a drawing, or by the learner. */
export interface AttemptDetail {
  checked: boolean;
  /** One per character when `checked`; otherwise `null`. */
  writing: WritingResult[] | null;
}

export const SELF_GRADED: AttemptDetail = { checked: false, writing: null };

/**
 * Append-only, one per answer, from any session — the journal and the
 * statistics read this. `reviews` stays the scheduler's own history (exact
 * undo); a scheduled answer writes both, under the same id.
 */
export interface Attempt extends AttemptDetail {
  /** The review's id for a scheduled answer; a fresh uuid for practice. */
  id: string;
  itemId: string;
  cardId: string;
  /** The card's deck when the answer was given; a later move does not rewrite history. */
  deckId: string;
  mode: StudyMode;
  source: AttemptSource;
  grade: Grade;
  correct: boolean;
  at: number;
  durationMs: number;
}
```

and extend `OutboxEntry.entity` to `'deck' | 'card' | 'item' | 'review' | 'attempt'`.

- [ ] **Step 4: Pure builders**

`core/db/attempts.ts`:

```ts
import type { Grade } from '~core/srs';
import { type Attempt, type AttemptDetail, type AttemptSource, type Card, type Item, type Review, DIRECTION_MODE, SELF_GRADED } from './schema';

export interface AttemptInput {
  id: string;
  item: Pick<Item, 'id' | 'cardId' | 'dir'>;
  deckId: string;
  source: AttemptSource;
  grade: Grade;
  at: number;
  durationMs: number;
  detail: AttemptDetail;
}

export function buildAttempt({ id, item, deckId, source, grade, at, durationMs, detail }: AttemptInput): Attempt {
  return {
    id,
    itemId: item.id,
    cardId: item.cardId,
    deckId,
    mode: DIRECTION_MODE[item.dir],
    source,
    grade,
    correct: grade > 1,
    at,
    durationMs,
    checked: detail.checked,
    writing: detail.writing,
  };
}

/**
 * The attempt a review written before attempts existed stands for. `null`
 * when its item or card is gone — there is no deck or mode to give it.
 */
export function attemptFromReview(review: Review, item: Item | undefined, card: Card | undefined): Attempt | null {
  if (!item || !card) return null;
  return buildAttempt({
    id: review.id,
    item,
    deckId: card.deckId,
    source: 'scheduled',
    grade: review.grade,
    at: review.reviewedAt,
    durationMs: review.durationMs,
    detail: SELF_GRADED,
  });
}
```

- [ ] **Step 5: Dexie version 3**

In `core/db/db.ts`: import `Attempt` and `attemptFromReview`; add `attempts!: Table<Attempt, string>;`; after version 2:

```ts
    // Every answer, from any session. The upgrade gives each existing review
    // its attempt under the review's own id, so two devices that both
    // upgrade produce the same rows and sync never duplicates them.
    this.version(3)
      .stores({ attempts: 'id, at, itemId, cardId, deckId, mode, source' })
      .upgrade(async (tx) => {
        const itemsById = new Map((await tx.table<Item>('items').toArray()).map((i) => [i.id, i]));
        const cardsById = new Map((await tx.table<Card>('cards').toArray()).map((c) => [c.id, c]));
        const rows: Attempt[] = [];
        for (const review of await tx.table<Review>('reviews').toArray()) {
          const item = itemsById.get(review.itemId);
          const attempt = attemptFromReview(review, item, item ? cardsById.get(item.cardId) : undefined);
          if (attempt) rows.push(attempt);
        }
        await tx.table<Attempt>('attempts').bulkPut(rows);
        await tx.table<OutboxEntry>('outbox').bulkPut(
          rows.map((a) => ({ id: crypto.randomUUID(), entity: 'attempt' as const, entityId: a.id, op: 'put' as const, at: a.at })),
        );
      });
```

- [ ] **Step 6: Repositories**

In `core/db/repositories.ts`: import `buildAttempt` from `./attempts` and `Attempt`, `AttemptDetail`, `SELF_GRADED` from `./schema`.

`RecordedReview` gains `detail?: AttemptDetail;` (doc: "How the answer was judged; self-graded when absent.").

`reviews.record`: destructure `detail = SELF_GRADED`; widen the transaction to `db.items, db.reviews, db.cards, db.attempts, db.outbox`; after `db.reviews.put(review)`:

```ts
      const card = await db.cards.get(item.cardId);
      await db.attempts.put(
        buildAttempt({ id: reviewId, item, deckId: card?.deckId ?? '', source: 'scheduled', grade, at: reviewedAt, durationMs, detail }),
      );
      await db.outbox.put(outboxEntry('attempt', reviewId, 'put', reviewedAt));
```

`reviews.undo`: widen the transaction to include `db.attempts`; after deleting the review:

```ts
      await db.attempts.delete(reviewId);
      await db.outbox.put(outboxEntry('attempt', reviewId, 'delete', Date.now()));
```

After `reviews`, add:

```ts
export interface LoggedAttempt {
  item: Item;
  grade: Grade;
  at: number;
  durationMs: number;
  detail: AttemptDetail;
}

export const attempts = {
  /** A practice answer: logged for the journal and statistics, never scheduled, never undone. */
  async log({ item, grade, at, durationMs, detail }: LoggedAttempt): Promise<string> {
    const id = uid();
    await db.transaction('rw', db.cards, db.attempts, db.outbox, async () => {
      const card = await db.cards.get(item.cardId);
      await db.attempts.put(buildAttempt({ id, item, deckId: card?.deckId ?? '', source: 'practice', grade, at, durationMs, detail }));
      await db.outbox.put(outboxEntry('attempt', id, 'put', at));
    });
    return id;
  },

  /** Every answer on a card, both directions and both sources, oldest first. */
  forCard: (cardId: string): Promise<Attempt[]> => db.attempts.where('cardId').equals(cardId).sortBy('at'),
};
```

- [ ] **Step 7: Run the suite and typecheck**

Run: `npm test && npm run typecheck`
Expected: the new tests pass. Existing tests that count outbox rows after a `reviews.record` may now see one extra `attempt` entry: fix such an assertion by filtering on `entity`, never by weakening it. Sync tests are handled in Task 3; if `test/sync/engine.test.ts` fails only because `pushed` now misses attempts, leave it for Task 3 and note it in the commit body.

- [ ] **Step 8: Commit**

```bash
git add core/db test/db
git commit -m "Log every answer in an attempts table, backfilled from reviews"
```

---

### Task 3: Sync attempts

**Files:**
- Modify: `core/sync/types.ts`, `core/sync/engine.ts`, `core/sync/supabase.ts`
- Create: `supabase/migrations/0002_attempts.sql`
- Test: `test/sync/engine.test.ts`, `test/composables/useSync.test.ts`

**Interfaces:**
- Consumes: `Attempt` (Task 2).
- Produces: `RemoteChanges.attempts`, `LocalChanges.attempts`, `EntityCounts.attempts`, `SyncEntity` includes `'attempt'`.

- [ ] **Step 1: Failing tests**

In `test/sync/engine.test.ts`:
- Import `attempts` from repositories and `Attempt` from schema.
- `FakeTransport`: add `attempts = new Map<string, Attempt>()`; `seed` accepts `attempts?: Attempt[]`; `pull` filters `[...this.attempts.values()].filter((a) => a.at > since)`, includes `...attempts.map((a) => a.at)` in `at`, and returns `attempts`; `push` inserts each attempt, throwing `attempt ${a.id} already exists — attempts are insert-only` on a known id.
- Add `attempts: 0` to both `pushed` `toEqual` objects.
- Add:

```ts
  it('pushes a practice attempt and lands a remote one', async () => {
    await decks.put(aDeck());
    await cards.create(aCard(), ['production'], NOW);
    const item = (await db.items.get('c1:production'))!;
    await attempts.log({ item, grade: 3, at: NOW, durationMs: 1, detail: { checked: false, writing: null } });
    const transport = new FakeTransport();
    const remote: Attempt = { id: 'remote', itemId: 'c1:production', cardId: 'c1', deckId: 'd1', mode: 'writing', source: 'practice', grade: 1, correct: false, at: NOW + 1, durationMs: 1, checked: false, writing: null };
    transport.seed({ attempts: [remote] });

    const result = await runSync(transport);

    expect(result.pushed.attempts).toBe(1);
    expect(result.pulled.attempts).toBe(1);
    expect(await db.attempts.get('remote')).toEqual(remote);
  });

  it('leaves a pulled attempt alone when its id is already here', async () => {
    const local: Attempt = { id: 'r1', itemId: 'c1:production', cardId: 'c1', deckId: 'd1', mode: 'writing', source: 'scheduled', grade: 3, correct: true, at: NOW, durationMs: 1, checked: true, writing: [] };
    await db.attempts.put(local);
    const transport = new FakeTransport();
    transport.seed({ attempts: [{ ...local, checked: false, writing: null }] });

    const result = await runSync(transport);

    expect(result.pulled.attempts).toBe(0);
    expect(await db.attempts.get('r1')).toEqual(local);
  });
```

In `test/composables/useSync.test.ts`, add `attempts: 0` to the counts objects.

- [ ] **Step 2: Run to see them fail**

Run: `npx vitest run test/sync test/composables/useSync.test.ts`
Expected: FAIL.

- [ ] **Step 3: Types and engine**

`core/sync/types.ts`: import `Attempt`; `SyncEntity` adds `'attempt'`; add `attempts: Attempt[]` to `RemoteChanges` and `LocalChanges`, `attempts: number` to `EntityCounts`. Update `pull`'s doc to "across all five entities" and `push`'s to mention attempts are insert-only like reviews.

`core/sync/engine.ts`:
- `applyRemote`: counts gain `attempts: 0`; the transaction includes `db.attempts`; after reviews:

```ts
    for (const row of remote.attempts) {
      if (!(await db.attempts.get(row.id))) {
        await db.attempts.put(row);
        counts.attempts += 1;
      }
    }
```

  Extend its doc comment: "Attempts follow the same rule as reviews."
- `OutboxGroups` gains `attemptIds`; `groupOutbox` routes `'review'` explicitly and `'attempt'` to `attemptIds`:

```ts
    else if (entry.entity === 'review') groups.reviewIds.add(entry.entityId);
    else groups.attemptIds.add(entry.entityId);
```

- `buildPayload` bulk-gets `db.attempts` and returns `attempts`. Its doc: an undone attempt, like an undone review, has no row left and nothing to push.
- `EMPTY_COUNTS` and the `pushed` result gain `attempts`.

- [ ] **Step 4: Supabase transport**

`core/sync/supabase.ts`:

```ts
interface AttemptRow {
  id: string;
  user_id: string;
  item_id: string;
  card_id: string;
  deck_id: string;
  mode: Attempt['mode'];
  source: Attempt['source'];
  grade: number;
  correct: boolean;
  at: number;
  duration_ms: number;
  checked: boolean;
  writing: Attempt['writing'];
}

function attemptFromRow(row: AttemptRow): Attempt {
  return {
    id: row.id, itemId: row.item_id, cardId: row.card_id, deckId: row.deck_id, mode: row.mode, source: row.source,
    grade: row.grade as Attempt['grade'], correct: row.correct, at: row.at, durationMs: row.duration_ms,
    checked: row.checked, writing: row.writing,
  };
}

function attemptToRow(a: Attempt, userId: string): AttemptRow {
  return {
    id: a.id, user_id: userId, item_id: a.itemId, card_id: a.cardId, deck_id: a.deckId, mode: a.mode, source: a.source,
    grade: a.grade, correct: a.correct, at: a.at, duration_ms: a.durationMs, checked: a.checked, writing: a.writing,
  };
}
```

`pull`: add `client.from('attempts').select('*').eq('user_id', userId).gt('at', since)` to the `Promise.all`, throw on its error, map with `attemptFromRow`, add `...attempts.map((a) => a.at)` to `maxAt`, return `attempts`. `push`: after reviews,

```ts
      if (changes.attempts.length > 0) {
        // Insert-only, like reviews: a retried push is ON CONFLICT DO NOTHING.
        const { error } = await client
          .from('attempts')
          .upsert(
            changes.attempts.map((a) => attemptToRow(a, userId)),
            { onConflict: 'user_id,id', ignoreDuplicates: true },
          );
        if (error) throw error;
      }
```

- [ ] **Step 5: Migration**

`supabase/migrations/0002_attempts.sql`:

```sql
-- `Attempt` (core/db/schema.ts): one row per answer, from a scheduled session
-- or endless practice. Append-only and insert-only for the owner, exactly
-- like `reviews` (see 0001): no update or delete policy, so a local undo of
-- an attempt already pushed here is not propagated — the same accepted gap
-- as for reviews. `writing` holds the per-character verdicts whole, as jsonb;
-- nothing queries into it.
create table if not exists public.attempts (
  id text not null,
  user_id uuid not null references auth.users (id) on delete cascade,
  item_id text not null,
  card_id text not null,
  deck_id text not null,
  mode text not null check (mode in ('review', 'writing')),
  source text not null check (source in ('scheduled', 'practice')),
  grade smallint not null check (grade between 1 and 4),
  correct boolean not null,
  at bigint not null,
  duration_ms integer not null,
  checked boolean not null,
  writing jsonb,
  primary key (user_id, id)
);

create index if not exists attempts_user_id_at_idx on public.attempts (user_id, at);

alter table public.attempts enable row level security;

create policy "attempts_select_own" on public.attempts for select using (auth.uid() = user_id);
create policy "attempts_insert_own" on public.attempts for insert with check (auth.uid() = user_id);
-- Deliberately no update or delete policy — see the note above the table.
```

- [ ] **Step 6: Run the suite and typecheck**

Run: `npm test && npm run typecheck`
Expected: PASS. If `app/` displays sync counts anywhere (`grep -rn "pushed\|pulled" app`), make sure it still compiles; do not add attempts to any user-facing copy.

- [ ] **Step 7: Commit**

```bash
git add core/sync supabase/migrations/0002_attempts.sql test/sync test/composables/useSync.test.ts
git commit -m "Sync attempts, insert-only like reviews"
```

---

### Task 4: Sessions record how an answer was judged

**Files:**
- Modify: `app/composables/useWritingAttempt.ts`, `app/composables/useReviewSession.ts`, `app/composables/usePracticeSession.ts`
- Test: `test/composables/useWritingAttempt.test.ts`, `test/composables/usePracticeSession.test.ts`, `test/session/useReviewSession.test.ts`

**Interfaces:**
- Consumes: `AttemptDetail`, `SELF_GRADED`, `WritingResult` (Task 2), `attempts.log` (Task 2), `StrokeCheck` (Task 1).
- Produces:
  - `useWritingAttempt(...).results: ComputedRef<WritingResult[]>` — one per checked character, in order.
  - `useWritingAttempt(...).firstOrderFault: ComputedRef<CharacterAttempt | null>` — first attempt with `shapeCorrect && !orderCorrect`.
  - `useReviewSession(mode).grade(value: Grade, detail?: AttemptDetail): Promise<void>`
  - `usePracticeSession(mode).grade(value: Grade, detail?: AttemptDetail): Promise<void>` — logs an attempt, then draws the next card.

- [ ] **Step 1: Failing tests**

`test/composables/useWritingAttempt.test.ts`:

```ts
  it('reports a verdict per character for the log', async () => {
    const attempt = useWritingAttempt(load);
    await attempt.start('十一');
    const [a, b] = drawn(DATA.十!);
    attempt.submit([b!, a!]);
    attempt.submit(drawn(DATA.一!));
    expect(attempt.results.value).toEqual([
      { character: '十', shapeCorrect: true, orderCorrect: false, error: 'stroke-order', strokeIndex: 0, expected: 2, drawn: 2 },
      { character: '一', shapeCorrect: true, orderCorrect: true, error: null, strokeIndex: null, expected: 1, drawn: 1 },
    ]);
    expect(attempt.firstOrderFault.value?.character).toBe('十');
  });
```

`test/composables/usePracticeSession.test.ts` (add `import { db } …` already present; add `SELF_GRADED` import from `~core/db/schema`):

```ts
  it('logs each answer as a practice attempt and leaves the schedule alone', async () => {
    const session = usePracticeSession('writing');
    await session.start();
    const item = session.current.value!;
    session.reveal();
    await session.grade(1, { checked: true, writing: [] });
    const logged = await db.attempts.toArray();
    expect(logged).toHaveLength(1);
    expect(logged[0]).toMatchObject({ itemId: item.id, source: 'practice', mode: 'writing', grade: 1, correct: false, checked: true, writing: [] });
    expect(await db.reviews.count()).toBe(0);
    expect(await db.items.get(item.id)).toEqual(item);
  });

  it('logs a self-graded answer when no detail is given', async () => {
    const session = usePracticeSession('review');
    await session.start();
    await session.grade(3);
    expect((await db.attempts.toArray())[0]).toMatchObject({ mode: 'review', ...SELF_GRADED });
  });
```

`test/session/useReviewSession.test.ts`:

```ts
  it('passes a checked drawing through to the attempt', async () => {
    const session = createSession('writing');
    await session.start();
    const writing = [{ character: '學', shapeCorrect: true, orderCorrect: false, error: 'stroke-direction' as const, strokeIndex: 1, expected: 8, drawn: 8 }];
    session.reveal();
    await session.grade(3, { checked: true, writing });
    const [attempt] = await db.attempts.toArray();
    expect(attempt).toMatchObject({ source: 'scheduled', mode: 'writing', checked: true, writing });
  });
```

(If the seed has no production item due at `start()`, look at the neighbouring writing-mode tests in `test/session/` for how they get one and do the same.)

- [ ] **Step 2: Run to see them fail**

Run: `npx vitest run test/composables test/session`
Expected: FAIL.

- [ ] **Step 3: `useWritingAttempt`**

```ts
import type { WritingResult } from '~core/db/schema';
…
  const firstOrderFault = computed(() => attempts.value.find((a) => a.check.shapeCorrect && !a.check.orderCorrect) ?? null);
  const results = computed<WritingResult[]>(() =>
    attempts.value.map(({ character, check }) => ({
      character,
      shapeCorrect: check.shapeCorrect,
      orderCorrect: check.orderCorrect,
      error: check.error,
      strokeIndex: check.strokeIndex,
      expected: check.expected,
      drawn: check.drawn,
    })),
  );
```

Return both. Importing a type from `~core/db/schema` in a composable is allowed.

- [ ] **Step 4: `useReviewSession`**

`gradeCore(value: Grade, detail: AttemptDetail)` passes `detail` into `reviews.record({...})`. `grade(value: Grade, detail: AttemptDetail = SELF_GRADED)` enqueues `() => gradeCore(value, detail)`. Doc line on `grade`: "`detail` says how the answer was judged; Writing passes the checker's verdicts, everything else is self-graded."

- [ ] **Step 5: `usePracticeSession`**

Import `attempts` from `~core/db/repositories` and `type AttemptDetail, SELF_GRADED` from `~core/db/schema`. Add `const shownAt = ref(Date.now());`, set `shownAt.value = Date.now()` at the end of `show()`. `grade`:

```ts
  async function grade(value: Grade, detail: AttemptDetail = SELF_GRADED): Promise<void> {
    const item = current.value;
    if (!item || busy.value) return;
    busy.value = true;
    try {
      const at = Date.now();
      // Logged first: a failed write surfaces to the page (a toast) and the
      // card stays on screen, rather than the answer silently vanishing.
      await attempts.log({ item, grade: value, at, durationMs: at - shownAt.value, detail });
      const correct = value > 1;
      weights.set(item.id, weightAfter(weights.get(item.id) ?? 1, correct));
      recent.push(item.id);
      seen.value += 1;
      if (correct) right.value += 1;
      await next();
    } finally {
      busy.value = false;
    }
  }
```

Update the composable's doc comment: "Nothing is scheduled — no review, no item update — but every answer is logged as a practice attempt for the journal and statistics."

- [ ] **Step 6: Run the suite and typecheck**

Run: `npm test && npm run typecheck`
Expected: PASS.

- [ ] **Step 7: Commit**

```bash
git add app/composables test/composables test/session
git commit -m "Record how each answer was judged, practice included"
```

---

### Task 5: Stroke-order player

**Files:**
- Create: `app/composables/useStrokeOrderPlayer.ts`, `app/components/StrokeOrderPlayer.vue`, `app/components/StrokeOrderPanel.vue`
- Test: `test/composables/useStrokeOrderPlayer.test.ts`

**Interfaces:**
- Consumes: `strokeOrderFrames`, `MODEL_BASELINE`, `CharacterStrokes` (Task 1); `HanziGrid`, `PAD_SIZE`.
- Produces:
  - `useStrokeOrderPlayer(total: () => number)` → `{ shown: Readonly<Ref<number>>, drawing: Readonly<Ref<number | null>>, run: Readonly<Ref<number>>, current: ComputedRef<number>, replay(): void, next(): void, prev(): void, strokeEnded(): void }`
  - `<StrokeOrderPlayer :model :highlight :character />` — `highlight?: { index: number; tone: 'danger' | 'warning' } | null`.
  - `export interface StrokeOrderEntry { character: string; model: DeepReadonly<CharacterStrokes>; highlight: { index: number; tone: 'danger' | 'warning' } | null }` in `useStrokeOrderPlayer.ts`.
  - `<StrokeOrderPanel :entries />` — `entries: StrokeOrderEntry[]`.

- [ ] **Step 1: Failing tests**

`test/composables/useStrokeOrderPlayer.test.ts`:

```ts
import { describe, expect, it } from 'vitest';
import { useStrokeOrderPlayer } from '~/composables/useStrokeOrderPlayer';

describe('useStrokeOrderPlayer', () => {
  it('replays every stroke in turn, then stops', () => {
    const p = useStrokeOrderPlayer(() => 3);
    p.replay();
    expect([p.shown.value, p.drawing.value, p.current.value]).toEqual([0, 0, 1]);
    p.strokeEnded();
    expect([p.shown.value, p.drawing.value]).toEqual([1, 1]);
    p.strokeEnded();
    p.strokeEnded();
    expect([p.shown.value, p.drawing.value, p.current.value]).toEqual([3, null, 3]);
  });

  it('next pauses the replay, finishes the stroke in progress and draws one more', () => {
    const p = useStrokeOrderPlayer(() => 4);
    p.replay();
    p.next();
    expect([p.shown.value, p.drawing.value]).toEqual([1, 1]);
    p.strokeEnded();
    expect([p.shown.value, p.drawing.value]).toEqual([2, null]);
  });

  it('prev pauses and takes one stroke away', () => {
    const p = useStrokeOrderPlayer(() => 4);
    p.replay();
    p.strokeEnded();
    p.strokeEnded();
    p.prev();
    expect([p.shown.value, p.drawing.value]).toEqual([1, null]);
    p.prev();
    p.prev();
    expect(p.shown.value).toBe(0);
  });

  it('does nothing past the last stroke', () => {
    const p = useStrokeOrderPlayer(() => 1);
    p.next();
    p.strokeEnded();
    p.next();
    expect([p.shown.value, p.drawing.value]).toEqual([1, null]);
  });

  it('bumps run on every replay so the animation restarts', () => {
    const p = useStrokeOrderPlayer(() => 2);
    p.replay();
    const first = p.run.value;
    p.replay();
    expect(p.run.value).toBe(first + 1);
  });

  it('ignores a stroke end with nothing drawing', () => {
    const p = useStrokeOrderPlayer(() => 2);
    p.strokeEnded();
    expect(p.shown.value).toBe(0);
  });
});
```

- [ ] **Step 2: Run to see it fail**

Run: `npx vitest run test/composables/useStrokeOrderPlayer.test.ts`
Expected: FAIL (module missing).

- [ ] **Step 3: The composable**

`app/composables/useStrokeOrderPlayer.ts`:

```ts
import type { DeepReadonly } from 'vue';
import type { CharacterStrokes } from '~core/chinese/strokes';

/** One character for `StrokeOrderPanel`, with the stroke to mark, if any. */
export interface StrokeOrderEntry {
  character: string;
  model: DeepReadonly<CharacterStrokes>;
  highlight: { index: number; tone: 'danger' | 'warning' } | null;
}

/**
 * The stroke-order player's state. `shown` strokes are drawn whole;
 * `drawing` is the one being animated, or `null`. The component calls
 * `strokeEnded` when that stroke's animation ends — under reduced motion
 * Kanto's duration tokens are 0s, so it ends at once and a replay shows the
 * whole character.
 *
 * `run` changes on every replay; the component keys the animated stroke on
 * it, so replaying the same stroke restarts its animation.
 */
export function useStrokeOrderPlayer(total: () => number) {
  const shown = ref(0);
  const drawing = ref<number | null>(null);
  const playing = ref(false);
  const run = ref(0);

  const current = computed(() => (drawing.value !== null ? drawing.value + 1 : shown.value));

  function replay(): void {
    run.value += 1;
    shown.value = 0;
    playing.value = total() > 0;
    drawing.value = total() > 0 ? 0 : null;
  }

  function strokeEnded(): void {
    if (drawing.value === null) return;
    shown.value = drawing.value + 1;
    drawing.value = playing.value && shown.value < total() ? shown.value : null;
    if (drawing.value === null) playing.value = false;
  }

  function next(): void {
    playing.value = false;
    if (drawing.value !== null) {
      shown.value = drawing.value + 1;
      drawing.value = null;
    }
    if (shown.value < total()) {
      run.value += 1;
      drawing.value = shown.value;
    }
  }

  function prev(): void {
    playing.value = false;
    drawing.value = null;
    shown.value = Math.max(0, shown.value - 1);
  }

  watch(total, () => {
    playing.value = false;
    drawing.value = null;
    shown.value = 0;
  });

  return { shown: readonly(shown), drawing: readonly(drawing), run: readonly(run), current, replay, next, prev, strokeEnded };
}
```

Check test 2 against the code: `replay()` → drawing 0; `next()` → shown 1, drawing 1 ✔; `strokeEnded()` with playing false → shown 2, drawing null ✔.

- [ ] **Step 4: `StrokeOrderPlayer.vue`**

```vue
<script setup lang="ts">
import type { DeepReadonly } from 'vue';
import { type CharacterStrokes, MODEL_BASELINE, strokeOrderFrames } from '~core/chinese/strokes';
import { useStrokeOrderPlayer } from '~/composables/useStrokeOrderPlayer';
import { PAD_SIZE } from '~/composables/useWritingAttempt';

/**
 * Shows how a character is written: each stroke fills in along its median,
 * in writing direction, clipped to the stroke's outline (the technique Hanzi
 * Writer uses), with its number at its start. Plays once on mount; Replay,
 * previous and next take over from there. `highlight` marks the stroke the
 * learner got wrong, in the danger colour for a shape fault and the warning
 * colour for an order fault.
 */
const props = defineProps<{
  model: DeepReadonly<CharacterStrokes>;
  character: string;
  highlight?: { index: number; tone: 'danger' | 'warning' } | null;
}>();

const frames = computed(() => strokeOrderFrames(props.model as CharacterStrokes));
const player = useStrokeOrderPlayer(() => frames.value.length);
const uid = useId();
const flip = `scale(1, -1) translate(0, -${MODEL_BASELINE})`;
const points = (median: readonly { x: number; y: number }[]) => median.map((p) => `${p.x},${p.y}`).join(' ');

onMounted(() => player.replay());
watch(() => props.model, () => player.replay());

function strokeClass(i: number): Record<string, boolean> {
  const done = i < player.shown.value;
  const marked = props.highlight?.index === i && done;
  return { done, danger: marked && props.highlight?.tone === 'danger', warning: marked && props.highlight?.tone === 'warning' };
}
</script>

<template>
  <div class="player">
    <svg class="board" :viewBox="`0 0 ${PAD_SIZE} ${PAD_SIZE}`" role="img" :aria-label="`Stroke order for ${character}`">
      <HanziGrid />
      <defs>
        <clipPath v-for="(d, i) in model.strokes" :id="`${uid}-${i}`" :key="i">
          <path :d="d" :transform="flip" />
        </clipPath>
      </defs>
      <g :transform="flip">
        <path v-for="(d, i) in model.strokes" :key="i" :d="d" class="stroke" :class="strokeClass(i)" />
      </g>
      <polyline
        v-if="player.drawing.value !== null"
        :key="`${player.run.value}-${player.drawing.value}`"
        class="brush"
        :clip-path="`url(#${uid}-${player.drawing.value})`"
        :points="points(frames[player.drawing.value]!.median)"
        :style="{ '--length': frames[player.drawing.value]!.length }"
        @animationend="player.strokeEnded()"
      />
      <template v-for="(frame, i) in frames" :key="`n${i}`">
        <text v-if="i < player.current.value" class="number" :x="frame.start.x" :y="frame.start.y">{{ i + 1 }}</text>
      </template>
    </svg>

    <div class="controls">
      <kt-button variant="secondary-no-bg" size="small" icon="rotate-ccw" label="Replay" @click="player.replay()" />
      <kt-button variant="secondary-no-bg" size="small" icon="chevron-left" label="Previous stroke" :disabled="player.current.value === 0" @click="player.prev()" />
      <span class="count">{{ player.current.value }} / {{ frames.length }}</span>
      <kt-button variant="secondary-no-bg" size="small" icon="chevron-right" label="Next stroke" :disabled="player.shown.value >= frames.length" @click="player.next()" />
    </div>
  </div>
</template>

<style scoped>
.player { display: flex; flex-direction: column; align-items: center; gap: var(--gap-element); width: 100%; }
.board {
  display: block;
  width: 100%;
  aspect-ratio: 1;
  background: var(--surface-field);
  border: var(--border-width) solid var(--border-subtle);
  border-radius: var(--border-radius-card);
}
.stroke { fill: var(--border-field); }
.stroke.done { fill: var(--text-body); }
.stroke.danger { fill: var(--color-danger-base); }
.stroke.warning { fill: var(--color-warning-base); }

/*
  viewBox units (the 1024 box), as in HanziPad: wide enough to cover the
  widest stroke, since the clip path trims it to the stroke's outline. The
  extra 160 in the dash covers the round caps at both ends.
*/
.brush {
  fill: none;
  stroke: var(--text-body);
  stroke-width: 160;
  stroke-linecap: round;
  stroke-linejoin: round;
  stroke-dasharray: calc(var(--length) + 160);
  stroke-dashoffset: calc(var(--length) + 160);
  animation: fk-stroke-draw calc(var(--duration-normal) * 3) linear forwards;
}
@keyframes fk-stroke-draw { to { stroke-dashoffset: 0; } }

/* viewBox units; the halo keeps a number legible over a filled stroke. */
.number {
  font-family: var(--font-family-code);
  font-size: 64px;
  fill: var(--color-primary-base);
  stroke: var(--surface-field);
  stroke-width: 12;
  paint-order: stroke;
  text-anchor: middle;
  dominant-baseline: central;
}

.controls { display: flex; align-items: center; gap: var(--gap-button); }
.count { font: var(--font-normal-small); font-family: var(--font-family-code); color: var(--text-muted); }
</style>
```

- [ ] **Step 5: `StrokeOrderPanel.vue`**

```vue
<script setup lang="ts">
import type { StrokeOrderEntry } from '~/composables/useStrokeOrderPlayer';

/**
 * The stroke-order player for a whole word: one character at a time, with
 * a segmented control to pick it when there are several.
 */
const props = defineProps<{ entries: StrokeOrderEntry[] }>();

const selected = ref(0);
watch(() => props.entries, () => (selected.value = 0));
const options = computed(() => props.entries.map((e, i) => ({ value: i, label: e.character })));
const entry = computed(() => props.entries[selected.value] ?? props.entries[0]);
</script>

<template>
  <section v-if="entry" class="panel" aria-label="Stroke order">
    <p class="overline">Stroke order</p>
    <kt-segmented-control
      v-if="entries.length > 1"
      size="small"
      label="Character"
      :options="options"
      :value="selected"
      @kt-change="(e: CustomEvent<{ value: number }>) => (selected = e.detail.value)"
    />
    <StrokeOrderPlayer :key="selected" :model="entry.model" :character="entry.character" :highlight="entry.highlight" />
  </section>
</template>

<style scoped>
.panel { display: flex; flex-direction: column; align-items: center; gap: var(--gap-element); width: 100%; max-width: 320px; }
.overline {
  margin: 0;
  font: var(--font-title-overline);
  letter-spacing: var(--letter-spacing-overline);
  text-transform: uppercase;
  color: var(--text-muted);
}
</style>
```

- [ ] **Step 6: Run the suite and typecheck**

Run: `npm test && npm run typecheck`
Expected: PASS (the integrity test is untouched: only SVG and Kanto elements).

- [ ] **Step 7: Commit**

```bash
git add app/composables/useStrokeOrderPlayer.ts app/components/StrokeOrderPlayer.vue app/components/StrokeOrderPanel.vue test/composables/useStrokeOrderPlayer.test.ts
git commit -m "Add a stroke-order player that draws each stroke in turn"
```

---

### Task 6: Writing screen — two verdicts and the player

**Files:**
- Create: `app/utils/writingVerdict.ts`, `app/components/WritingVerdict.vue`
- Modify: `app/pages/writing.vue`, `app/components/WritingCard.vue`
- Test: `test/utils/writingVerdict.test.ts`

**Interfaces:**
- Consumes: `CharacterAttempt` (with `check: StrokeCheck`), `results`, `grade(value, detail)` (Task 4), `StrokeOrderPanel` (Task 5).
- Produces:
  ```ts
  export interface Verdict { heading: string; variant: 'success' | 'danger' | 'warning' | 'info' }
  export function characterVerdict(attempts: readonly { character: string; check: StrokeCheck }[]): Verdict;
  export function orderVerdict(attempts: readonly { character: string; check: StrokeCheck }[]): Verdict;
  export function highlightFor(check: StrokeCheck): { index: number; tone: 'danger' | 'warning' } | null;
  ```

- [ ] **Step 1: Failing tests**

`test/utils/writingVerdict.test.ts`:

```ts
import { describe, expect, it } from 'vitest';
import type { StrokeCheck } from '~core/chinese/strokes';
import { characterVerdict, highlightFor, orderVerdict } from '~/utils/writingVerdict';

const ok = (n: number): StrokeCheck => ({ shapeCorrect: true, orderCorrect: true, error: null, strokeIndex: null, expected: n, drawn: n, match: [], reversed: [] });
const fault = (over: Partial<StrokeCheck>): StrokeCheck => ({ ...ok(8), shapeCorrect: true, orderCorrect: false, ...over });

describe('characterVerdict', () => {
  it('is right when every shape is right, order aside', () => {
    expect(characterVerdict([{ character: '十', check: fault({ error: 'stroke-order', strokeIndex: 0 }) }])).toEqual({ heading: 'Right', variant: 'success' });
  });

  it('gives the stroke count, capitalised when alone', () => {
    const check = fault({ shapeCorrect: false, error: 'stroke-count', drawn: 7 });
    expect(characterVerdict([{ character: '學', check }]).heading).toBe('Wrong stroke count, 7 of 8');
  });

  it('names the character in a word', () => {
    const check = fault({ shapeCorrect: false, error: 'stroke-shape', strokeIndex: 2 });
    expect(characterVerdict([{ character: '學', check: ok(8) }, { character: '習', check }])).toEqual({ heading: "習: stroke 3 doesn't match", variant: 'danger' });
  });
});

describe('orderVerdict', () => {
  it('is right when every order is right', () => {
    expect(orderVerdict([{ character: '十', check: ok(2) }])).toEqual({ heading: 'Right', variant: 'success' });
  });

  it('names a stroke out of order', () => {
    expect(orderVerdict([{ character: '十', check: fault({ error: 'stroke-order', strokeIndex: 0 }) }])).toEqual({ heading: 'Stroke 1 drawn out of order', variant: 'warning' });
  });

  it('names a stroke drawn backwards', () => {
    expect(orderVerdict([{ character: '永', check: fault({ error: 'stroke-direction', strokeIndex: 1 }) }]).heading).toBe('Stroke 2 drawn backwards');
  });

  it('reports an order fault in one character even when another has a shape fault', () => {
    const shape = fault({ shapeCorrect: false, error: 'stroke-shape', strokeIndex: 0 });
    const order = fault({ error: 'stroke-order', strokeIndex: 3 });
    expect(orderVerdict([{ character: '學', check: shape }, { character: '習', check: order }]).heading).toBe('習: stroke 4 drawn out of order');
    expect(characterVerdict([{ character: '學', check: shape }, { character: '習', check: order }]).variant).toBe('danger');
  });

  it('is not checked when the only faults are shape faults', () => {
    const shape = fault({ shapeCorrect: false, error: 'stroke-count' });
    expect(orderVerdict([{ character: '學', check: shape }])).toEqual({ heading: 'Not checked', variant: 'info' });
  });
});

describe('highlightFor', () => {
  it('marks a shape fault in danger and an order fault in warning', () => {
    expect(highlightFor(fault({ shapeCorrect: false, error: 'stroke-shape', strokeIndex: 2 }))).toEqual({ index: 2, tone: 'danger' });
    expect(highlightFor(fault({ error: 'stroke-order', strokeIndex: 1 }))).toEqual({ index: 1, tone: 'warning' });
    expect(highlightFor(ok(3))).toBeNull();
    expect(highlightFor(fault({ shapeCorrect: false, error: 'stroke-count', strokeIndex: null }))).toBeNull();
  });
});
```

- [ ] **Step 2: Run to see it fail**

Run: `npx vitest run test/utils/writingVerdict.test.ts`
Expected: FAIL (module missing).

- [ ] **Step 3: `app/utils/writingVerdict.ts`**

```ts
import type { StrokeCheck } from '~core/chinese/strokes';

/** The copy and colour of one of the two verdicts shown after Check. */
export interface Verdict {
  heading: string;
  variant: 'success' | 'danger' | 'warning' | 'info';
}

type Checked = { character: string; check: StrokeCheck };

function sentence(prefix: string, text: string): string {
  return prefix ? `${prefix}${text}` : text.charAt(0).toUpperCase() + text.slice(1);
}

function prefixFor(attempts: readonly Checked[], a: Checked): string {
  return attempts.length > 1 ? `${a.character}: ` : '';
}

/** The character itself: every stroke there and in place, whatever the order. */
export function characterVerdict(attempts: readonly Checked[]): Verdict {
  const wrong = attempts.find((a) => !a.check.shapeCorrect);
  if (!wrong) return { heading: 'Right', variant: 'success' };
  const prefix = prefixFor(attempts, wrong);
  const { error, drawn, expected, strokeIndex } = wrong.check;
  if (error === 'stroke-count') return { heading: sentence(prefix, `wrong stroke count, ${drawn} of ${expected}`), variant: 'danger' };
  return { heading: sentence(prefix, `stroke ${(strokeIndex ?? 0) + 1} doesn't match`), variant: 'danger' };
}

/**
 * The stroke order. Judged only on characters whose shape is right; when no
 * such character has an order fault but some shape was wrong, the order
 * could not be judged.
 */
export function orderVerdict(attempts: readonly Checked[]): Verdict {
  const fault = attempts.find((a) => a.check.shapeCorrect && !a.check.orderCorrect);
  if (fault) {
    const n = (fault.check.strokeIndex ?? 0) + 1;
    const what = fault.check.error === 'stroke-direction' ? `stroke ${n} drawn backwards` : `stroke ${n} drawn out of order`;
    return { heading: sentence(prefixFor(attempts, fault), what), variant: 'warning' };
  }
  if (attempts.every((a) => a.check.orderCorrect)) return { heading: 'Right', variant: 'success' };
  return { heading: 'Not checked', variant: 'info' };
}

/** Which model stroke the overlay and the player mark, and in which colour. */
export function highlightFor(check: StrokeCheck): { index: number; tone: 'danger' | 'warning' } | null {
  if (check.strokeIndex === null || check.strokeIndex >= check.expected) return null;
  if (!check.shapeCorrect) return { index: check.strokeIndex, tone: 'danger' };
  if (!check.orderCorrect) return { index: check.strokeIndex, tone: 'warning' };
  return null;
}
```

- [ ] **Step 4: `WritingVerdict.vue`**

```vue
<script setup lang="ts">
import type { DeepReadonly } from 'vue';
import type { CharacterAttempt } from '~/composables/useWritingAttempt';
import { characterVerdict, highlightFor, orderVerdict } from '~/utils/writingVerdict';

/**
 * What follows Check: the two verdicts — the character, then its stroke
 * order — the learner's strokes over the model, and the stroke-order player.
 * Only the character verdict grades the card; the order is logged.
 */
const props = defineProps<{ attempts: DeepReadonly<CharacterAttempt[]> }>();

const character = computed(() => characterVerdict(props.attempts as CharacterAttempt[]));
const order = computed(() => orderVerdict(props.attempts as CharacterAttempt[]));
const entries = computed(() =>
  props.attempts.map((a) => ({ character: a.character, model: a.model, highlight: highlightFor(a.check as CharacterAttempt['check']) })),
);
</script>

<template>
  <div class="verdict">
    <div class="alerts">
      <kt-alert :variant="character.variant" eyebrow="Character" :heading="character.heading" />
      <kt-alert :variant="order.variant" eyebrow="Stroke order" :heading="order.heading" />
    </div>
    <div class="overlays" :style="{ gridTemplateColumns: `repeat(${attempts.length}, minmax(0, 160px))` }">
      <StrokeOverlay v-for="(a, i) in attempts" :key="i" :attempt="a" />
    </div>
    <StrokeOrderPanel :entries="entries" />
  </div>
</template>

<style scoped>
.verdict { display: flex; flex-direction: column; align-items: center; gap: var(--gap-form); width: 100%; }
.alerts { display: grid; grid-template-columns: repeat(auto-fit, minmax(200px, 1fr)); gap: var(--gap-button); width: 100%; }
.overlays { display: grid; justify-content: center; gap: var(--gap-button); width: 100%; }
</style>
```

Check `kt-alert`'s props in `node_modules/kanto-ds/dist/components/feedback/kt-alert/kt-alert.d.ts`. If it has no `eyebrow`, put the label in the heading instead (`Character: Right`, `Stroke order: Not checked`) and change the tests in Step 1 to match.

- [ ] **Step 5: `WritingCard.vue` — a slot under the answer**

Inside the `.answer` div, after the zhuyin span, add `<slot name="answer-extra" />`. Doc comment: "`answer-extra` sits under the revealed answer — the stroke-order player for a self-graded card."

- [ ] **Step 6: `writing.vue`**

1. Remove `verdictHeading` and the inline `.verdict`/`.overlays` markup and styles. In their place, inside `WritingCard`:

```html
        <WritingVerdict v-if="checked" :attempts="attempt.attempts.value" />
```

2. The player for a self-graded card:

```ts
import type { CharacterStrokes } from '~core/chinese/strokes';
import { SELF_GRADED } from '~core/db/schema';
import type { StrokeOrderEntry } from '~/composables/useStrokeOrderPlayer';

/**
 * A self-graded card (after an undo, or with nothing checked) still shows
 * how its characters are written, when every one has stroke data.
 */
const answerStrokes = ref<StrokeOrderEntry[] | null>(null);
watch(
  () => [selfGraded.value, session.card.value?.hanzi] as const,
  async ([on, hanzi]) => {
    answerStrokes.value = null;
    if (!on || !hanzi) return;
    const characters = [...hanzi];
    const models = await Promise.all(characters.map((c) => loadStrokes(c)));
    if (!selfGraded.value || session.card.value?.hanzi !== hanzi) return;
    if (models.some((m) => !m)) return;
    answerStrokes.value = characters.map((character, i) => ({ character, model: models[i] as CharacterStrokes, highlight: null }));
  },
);
```

and inside `WritingCard`:

```html
        <template #answer-extra>
          <StrokeOrderPanel v-if="answerStrokes" :entries="answerStrokes" />
        </template>
```

`SELF_GRADED` is a value import from `~core/db/schema`, which the integrity test forbids in a page. Instead, export `SELF_GRADED` again from `app/composables/useReviewSession.ts` (`export { SELF_GRADED } from '~core/db/schema';`) and import it from there.

3. `grade` passes the detail:

```ts
async function grade(value: Grade) {
  hasGraded.value = true;
  const detail = checked.value ? { checked: true, writing: [...attempt.results.value] } : SELF_GRADED;
  try {
    await session.grade(value, detail);
  } catch (err) {
```

(rest unchanged).

4. Update the page's top doc comment: "drawn and checked: two verdicts (the character, which sets the grade, and the stroke order, which is only logged), the stroke-order player, then Continue".

- [ ] **Step 7: Run the suite and typecheck**

Run: `npm test && npm run typecheck`
Expected: PASS.

- [ ] **Step 8: Check it in the app**

Run `npm run dev`. In Writing, draw 十 with its strokes swapped: expect *Character: Right*, *Stroke order: Stroke 1 drawn out of order*, the player animating 一 then 丨 with numbers, and Continue grading Good. Undo: the card comes back revealed, with the player under the answer. In endless practice (`/writing?endless=1`), answer one card, then check in the browser's IndexedDB (`fanka` → `attempts`) that a `practice` row landed.

- [ ] **Step 9: Commit**

```bash
git add app/utils/writingVerdict.ts app/components/WritingVerdict.vue app/components/WritingCard.vue app/pages/writing.vue app/composables/useReviewSession.ts test/utils/writingVerdict.test.ts
git commit -m "Show the character and stroke-order verdicts apart, with the stroke order animated"
```

---

### Task 7: Stats core — time and filtering

**Files:**
- Create: `core/stats/time.ts`, `core/stats/filter.ts`, `core/stats/index.ts`
- Test: `test/stats/time.test.ts`, `test/stats/filter.test.ts`

**Interfaces:**
- Produces:
  ```ts
  // time.ts
  export const DAY_MS = 86_400_000;
  export type StatsWindow = '7d' | '30d' | '90d' | '1y' | 'all';
  export function startOfDayLocal(ms: number): number;
  export function addDays(ms: number, days: number): number;
  export function dayKey(ms: number): string;             // yyyy-mm-dd, local
  export function windowStart(window: StatsWindow, now: number): number; // 0 for 'all'
  export interface Bucket { key: string; start: number; end: number }
  export function timeBuckets(window: StatsWindow, now: number, earliest: number | null): Bucket[];
  export function findBucket(buckets: readonly Bucket[], at: number): number; // -1 when outside
  export function inWindow(at: number, window: StatsWindow, now: number): boolean; // window start ≤ at < tomorrow
  // filter.ts
  export interface StatsFilter { window: StatsWindow; deckId: string | null; mode: StudyMode | null }
  export interface StatsSnapshot { attempts: Attempt[]; reviews: Review[]; items: Item[]; cards: Card[]; decks: Deck[] }
  export interface FilteredSnapshot { attempts: Attempt[]; reviews: Review[]; items: Item[]; itemsById: Map<string, Item>; cardsById: Map<string, Card>; decksById: Map<string, Deck> }
  export function applyFilter(snapshot: StatsSnapshot, filter: Pick<StatsFilter, 'deckId' | 'mode'>): FilteredSnapshot;
  ```

- [ ] **Step 1: Failing tests**

`test/stats/time.test.ts`:

```ts
import { describe, expect, it } from 'vitest';
import { addDays, dayKey, findBucket, startOfDayLocal, timeBuckets, windowStart } from '~core/stats/time';

const local = (m: number, d: number, h = 10) => new Date(2026, m - 1, d, h).getTime();
const NOW = local(9, 29);

describe('time helpers', () => {
  it('steps whole local days, landing on midnight even across a clock change', () => {
    const start = startOfDayLocal(local(3, 1));
    for (let i = 1; i <= 300; i += 1) expect(new Date(addDays(start, i)).getHours()).toBe(0);
  });

  it('keys a day in local time', () => {
    expect(dayKey(local(9, 3, 23))).toBe('2026-09-03');
  });

  it('opens a 7-day window six days before today', () => {
    expect(windowStart('7d', NOW)).toBe(startOfDayLocal(local(9, 23)));
    expect(windowStart('all', NOW)).toBe(0);
  });
});

describe('timeBuckets', () => {
  it('buckets by day for short windows, oldest first, ending today', () => {
    const buckets = timeBuckets('7d', NOW, null);
    expect(buckets).toHaveLength(7);
    expect(buckets[0]!.key).toBe('2026-09-23');
    expect(buckets[6]!.key).toBe('2026-09-29');
  });

  it('buckets by week for long windows, clipping the oldest', () => {
    const buckets = timeBuckets('90d', NOW, null);
    expect(buckets).toHaveLength(13);
    expect(buckets[0]!.start).toBe(windowStart('90d', NOW));
    expect(buckets.at(-1)!.end).toBe(addDays(startOfDayLocal(NOW), 1));
  });

  it('starts All at the first answer, and is empty without one', () => {
    expect(timeBuckets('all', NOW, null)).toEqual([]);
    expect(timeBuckets('all', NOW, local(9, 1))[0]!.start).toBe(startOfDayLocal(local(9, 1)));
  });

  it('finds the bucket an instant falls in', () => {
    const buckets = timeBuckets('7d', NOW, null);
    expect(findBucket(buckets, local(9, 25, 12))).toBe(2);
    expect(findBucket(buckets, local(9, 1))).toBe(-1);
  });
});
```

`test/stats/filter.test.ts`:

```ts
import { describe, expect, it } from 'vitest';
import { applyFilter } from '~core/stats/filter';
import { aCard, aDeck, anAttempt, anItem, aReview } from './fixtures';

describe('applyFilter', () => {
  const snapshot = {
    decks: [aDeck('d1'), aDeck('d2'), aDeck('gone', { deletedAt: 1 })],
    cards: [aCard('c1', 'd1'), aCard('c2', 'd2'), aCard('c3', 'gone'), aCard('c4', 'd1', { deletedAt: 1 })],
    items: [anItem('c1', 'production'), anItem('c1', 'recognition'), anItem('c2', 'production'), anItem('c3', 'production'), anItem('c4', 'production'), anItem('c2', 'recognition', { suspended: true })],
    reviews: [aReview('r1', 'c1:production'), aReview('r2', 'c2:production'), aReview('r3', 'c1:recognition')],
    attempts: [anAttempt('a1', { cardId: 'c1', deckId: 'd1', mode: 'writing' }), anAttempt('a2', { cardId: 'c2', deckId: 'd2', mode: 'review' })],
  };

  it('keeps live, unsuspended items only', () => {
    expect(applyFilter(snapshot, { deckId: null, mode: null }).items.map((i) => i.id).sort()).toEqual(['c1:production', 'c1:recognition', 'c2:production']);
  });

  it('narrows items, reviews and attempts to a deck and a mode', () => {
    const f = applyFilter(snapshot, { deckId: 'd1', mode: 'writing' });
    expect(f.items.map((i) => i.id)).toEqual(['c1:production']);
    expect(f.reviews.map((r) => r.id)).toEqual(['r1']);
    expect(f.attempts.map((a) => a.id)).toEqual(['a1']);
  });

  it('keeps every card and deck in the lookups, deleted ones included, for history', () => {
    const f = applyFilter(snapshot, { deckId: null, mode: null });
    expect(f.cardsById.has('c4')).toBe(true);
    expect(f.decksById.has('gone')).toBe(true);
  });
});
```

`test/stats/fixtures.ts` (shared by every stats test):

```ts
import type { Attempt, Card, Deck, Direction, Item, Review } from '~core/db/schema';

export const local = (m: number, d: number, h = 10, min = 0) => new Date(2026, m - 1, d, h, min).getTime();
export const NOW = local(9, 29, 12);

export const aDeck = (id: string, over: Partial<Deck> = {}): Deck => ({
  id, name: id.toUpperCase(), description: '', colorToken: 'var(--chart-series-1)', tag: '', translationLang: 'en',
  createdAt: 0, updatedAt: 0, deletedAt: null, ...over,
});

export const aCard = (id: string, deckId: string, over: Partial<Card> = {}): Card => ({
  id, deckId, hanzi: '學', pinyin: [], zhuyin: '', translation: 'to study', pos: 'verb', example: '', examplePinyin: '',
  exampleTranslation: '', tags: [], note: '', createdAt: 0, updatedAt: 0, deletedAt: null, ...over,
});

export const anItem = (cardId: string, dir: Direction, over: Partial<Item> = {}): Item => ({
  id: `${cardId}:${dir}`, cardId, dir, suspended: false, state: 'review', due: NOW, stability: 1, difficulty: 5,
  elapsedDays: 0, scheduledDays: 5, reps: 3, lapses: 0, learningSteps: 0, lastReview: null, updatedAt: 0, ...over,
});

export const aReview = (id: string, itemId: string, over: Partial<Review> = {}, before: Partial<Review['before']> = {}): Review => ({
  id, itemId, grade: 3, reviewedAt: NOW, durationMs: 5000,
  before: { state: 'review', due: 0, stability: 1, difficulty: 5, elapsedDays: 0, scheduledDays: 5, reps: 1, lapses: 0, learningSteps: 0, lastReview: null, updatedAt: 0, ...before },
  ...over,
});

export const anAttempt = (id: string, over: Partial<Attempt> = {}): Attempt => ({
  id, itemId: 'c1:production', cardId: 'c1', deckId: 'd1', mode: 'writing', source: 'scheduled', grade: 3, correct: true,
  at: NOW, durationMs: 5000, checked: false, writing: null, ...over,
});
```

- [ ] **Step 2: Run to see them fail**

Run: `npx vitest run test/stats`
Expected: FAIL (modules missing).

- [ ] **Step 3: `core/stats/time.ts`**

```ts
/**
 * Calendar arithmetic for statistics, in the learner's local time. Days are
 * stepped with `setDate`, never by adding 24 h, so a daylight-saving change
 * never shifts a bucket off midnight.
 */
export const DAY_MS = 86_400_000;

export type StatsWindow = '7d' | '30d' | '90d' | '1y' | 'all';

const WINDOW_DAYS: Record<Exclude<StatsWindow, 'all'>, number> = { '7d': 7, '30d': 30, '90d': 90, '1y': 365 };

export function startOfDayLocal(ms: number): number {
  const d = new Date(ms);
  d.setHours(0, 0, 0, 0);
  return d.getTime();
}

export function addDays(ms: number, days: number): number {
  const d = new Date(ms);
  d.setDate(d.getDate() + days);
  return d.getTime();
}

export function dayKey(ms: number): string {
  const d = new Date(ms);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

/** The first instant a window covers — today included. `0` for All. */
export function windowStart(window: StatsWindow, now: number): number {
  if (window === 'all') return 0;
  return addDays(startOfDayLocal(now), -(WINDOW_DAYS[window] - 1));
}

export function inWindow(at: number, window: StatsWindow, now: number): boolean {
  return at >= windowStart(window, now) && at < addDays(startOfDayLocal(now), 1);
}

export interface Bucket {
  /** `dayKey` of the bucket's first day. */
  key: string;
  start: number;
  end: number;
}

/**
 * Where a time series puts its points: one per day for 7 and 30 days, one
 * per 7 days otherwise, counted back from today so the newest bucket is
 * always whole and the oldest is clipped to the window. All starts on the
 * day of the first answer, and has no buckets without one.
 */
export function timeBuckets(window: StatsWindow, now: number, earliest: number | null): Bucket[] {
  const end = addDays(startOfDayLocal(now), 1);
  if (window === 'all' && earliest === null) return [];
  const start = window === 'all' ? startOfDayLocal(earliest!) : windowStart(window, now);
  const step = window === '7d' || window === '30d' ? 1 : 7;
  const buckets: Bucket[] = [];
  for (let cursor = end; cursor > start; cursor = addDays(cursor, -step)) {
    const bucketStart = Math.max(start, addDays(cursor, -step));
    buckets.unshift({ key: dayKey(bucketStart), start: bucketStart, end: cursor });
  }
  return buckets;
}

/** Index of the bucket holding `at`, or -1. Binary search: buckets are sorted and contiguous. */
export function findBucket(buckets: readonly Bucket[], at: number): number {
  let lo = 0;
  let hi = buckets.length - 1;
  while (lo <= hi) {
    const mid = (lo + hi) >> 1;
    const b = buckets[mid]!;
    if (at < b.start) hi = mid - 1;
    else if (at >= b.end) lo = mid + 1;
    else return mid;
  }
  return -1;
}
```

- [ ] **Step 4: `core/stats/filter.ts`**

```ts
import { type Attempt, type Card, type Deck, type Item, type Review, type StudyMode, DIRECTION_MODE } from '~core/db/schema';
import type { StatsWindow } from './time';

export interface StatsFilter {
  window: StatsWindow;
  deckId: string | null;
  mode: StudyMode | null;
}

/** Every row the Statistics page reads, as it stood when the page opened. */
export interface StatsSnapshot {
  attempts: Attempt[];
  reviews: Review[];
  items: Item[];
  cards: Card[];
  decks: Deck[];
}

export interface FilteredSnapshot {
  /** Answers in the deck (as it was at the time) and mode. Not windowed. */
  attempts: Attempt[];
  /** Reviews of items in the deck (as it is now) and mode. Not windowed. */
  reviews: Review[];
  /** Live, unsuspended items in the deck and mode — what the schedule holds today. */
  items: Item[];
  /** Every item, card and deck, deleted ones included, so history still resolves. */
  itemsById: Map<string, Item>;
  cardsById: Map<string, Card>;
  decksById: Map<string, Deck>;
}

/**
 * Narrows a snapshot to a deck and a mode. The window is left to each
 * aggregate: streaks and the year calendar look past it.
 */
export function applyFilter(snapshot: StatsSnapshot, filter: Pick<StatsFilter, 'deckId' | 'mode'>): FilteredSnapshot {
  const decksById = new Map(snapshot.decks.map((d) => [d.id, d]));
  const cardsById = new Map(snapshot.cards.map((c) => [c.id, c]));
  const itemsById = new Map(snapshot.items.map((i) => [i.id, i]));
  const deckOk = (deckId: string | undefined) => filter.deckId === null || deckId === filter.deckId;
  const modeOk = (item: Item) => filter.mode === null || DIRECTION_MODE[item.dir] === filter.mode;
  const live = (card: Card | undefined) => card !== undefined && card.deletedAt === null && decksById.get(card.deckId)?.deletedAt === null;

  const items = snapshot.items.filter((i) => {
    const card = cardsById.get(i.cardId);
    return !i.suspended && live(card) && deckOk(card!.deckId) && modeOk(i);
  });
  const reviews = snapshot.reviews.filter((r) => {
    const item = itemsById.get(r.itemId);
    return item !== undefined && modeOk(item) && deckOk(cardsById.get(item.cardId)?.deckId);
  });
  const attempts = snapshot.attempts.filter((a) => deckOk(a.deckId) && (filter.mode === null || a.mode === filter.mode));

  return { attempts, reviews, items, itemsById, cardsById, decksById };
}
```

- [ ] **Step 5: `core/stats/index.ts`**

```ts
export * from './filter';
export * from './time';
```

(Later tasks add their modules here.)

- [ ] **Step 6: Run the suite and typecheck**

Run: `npm test && npm run typecheck`
Expected: PASS.

- [ ] **Step 7: Commit**

```bash
git add core/stats test/stats
git commit -m "Add the pure time and filter layer for statistics"
```

---

### Task 8: Stats core — activity

**Files:**
- Create: `core/stats/activity.ts`
- Modify: `core/stats/index.ts`
- Test: `test/stats/activity.test.ts`

**Interfaces:**
- Consumes: Task 7.
- Produces:
  ```ts
  export const MAX_ANSWER_MS = 60_000;
  export interface ActivitySummary {
    currentStreak: number; bestStreak: number; daysStudied: number;
    answers: number; totalMs: number; averageMs: number; perStudyDay: number;
    calendar: { date: string; count: number; weekday: number }[]; // 371 days ending today; weekday 0 = Monday
    time: { key: string; scheduledMs: number; practiceMs: number }[];
    byHour: number[];                                              // 24
    byMode: { review: number; writing: number };
  }
  export function activitySummary(attempts: readonly Attempt[], window: StatsWindow, now: number): ActivitySummary;
  ```

- [ ] **Step 1: Failing tests**

`test/stats/activity.test.ts`:

```ts
import { describe, expect, it } from 'vitest';
import { MAX_ANSWER_MS, activitySummary } from '~core/stats/activity';
import { NOW, anAttempt, local } from './fixtures';

const on = (d: number, over = {}) => anAttempt(`a${d}-${Math.random()}`, { at: local(9, d), ...over });

describe('activitySummary', () => {
  it('counts a streak ending today, or yesterday when today is still empty', () => {
    expect(activitySummary([on(27), on(28), on(29)], '30d', NOW).currentStreak).toBe(3);
    expect(activitySummary([on(27), on(28)], '30d', NOW).currentStreak).toBe(2);
    expect(activitySummary([on(26), on(28)], '30d', NOW).currentStreak).toBe(1);
    expect(activitySummary([on(20)], '30d', NOW).currentStreak).toBe(0);
  });

  it('finds the best streak anywhere in the history, window aside', () => {
    expect(activitySummary([on(1), on(2), on(3), on(4), on(10), on(29)], '7d', NOW).bestStreak).toBe(4);
  });

  it('sums time with each answer capped, and averages it', () => {
    const s = activitySummary([on(29, { durationMs: 10_000 }), on(29, { durationMs: 3_600_000 })], '7d', NOW);
    expect(s.totalMs).toBe(10_000 + MAX_ANSWER_MS);
    expect(s.averageMs).toBe((10_000 + MAX_ANSWER_MS) / 2);
    expect(s.answers).toBe(2);
    expect(s.daysStudied).toBe(1);
    expect(s.perStudyDay).toBe(2);
  });

  it('leaves answers outside the window out of the tiles', () => {
    expect(activitySummary([on(1), on(29)], '7d', NOW).answers).toBe(1);
  });

  it('splits time per bucket by source', () => {
    const s = activitySummary([on(29, { durationMs: 1000 }), on(29, { durationMs: 2000, source: 'practice' })], '7d', NOW);
    expect(s.time.at(-1)).toEqual({ key: '2026-09-29', scheduledMs: 1000, practiceMs: 2000 });
  });

  it('counts answers by hour and by mode', () => {
    const s = activitySummary([anAttempt('x', { at: local(9, 29, 8, 30), mode: 'review' }), anAttempt('y', { at: local(9, 28, 8, 5) })], '7d', NOW);
    expect(s.byHour[8]).toBe(2);
    expect(s.byMode).toEqual({ review: 1, writing: 1 });
  });

  it('lays out a year calendar ending today, with weekdays from Monday', () => {
    const s = activitySummary([on(29), on(29)], '7d', NOW);
    expect(s.calendar).toHaveLength(371);
    expect(s.calendar.at(-1)).toEqual({ date: '2026-09-29', count: 2, weekday: 1 }); // a Tuesday
  });

  it('is all zeros with no answers', () => {
    const s = activitySummary([], '30d', NOW);
    expect([s.currentStreak, s.bestStreak, s.answers, s.averageMs, s.perStudyDay]).toEqual([0, 0, 0, 0, 0]);
  });
});
```

- [ ] **Step 2: Run to see it fail**

Run: `npx vitest run test/stats/activity.test.ts`
Expected: FAIL.

- [ ] **Step 3: Implement**

`core/stats/activity.ts`:

```ts
import type { Attempt } from '~core/db/schema';
import { type StatsWindow, addDays, dayKey, findBucket, inWindow, startOfDayLocal, timeBuckets } from './time';

/** One answer counts for at most a minute of study time: a card left on screen over a break is not study. */
export const MAX_ANSWER_MS = 60_000;

const CALENDAR_DAYS = 53 * 7;

export interface ActivitySummary {
  currentStreak: number;
  bestStreak: number;
  daysStudied: number;
  answers: number;
  totalMs: number;
  averageMs: number;
  perStudyDay: number;
  calendar: { date: string; count: number; weekday: number }[];
  time: { key: string; scheduledMs: number; practiceMs: number }[];
  byHour: number[];
  byMode: { review: number; writing: number };
}

const capped = (a: Attempt) => Math.min(a.durationMs, MAX_ANSWER_MS);

/** `days` maps each studied day's key to its local midnight. */
function streaks(days: Map<string, number>, now: number): { current: number; best: number } {
  const today = startOfDayLocal(now);
  let current = 0;
  // Today may still be empty without breaking a streak earned before it.
  let cursor = days.has(dayKey(today)) ? today : addDays(today, -1);
  while (days.has(dayKey(cursor))) {
    current += 1;
    cursor = addDays(cursor, -1);
  }

  let best = 0;
  let run = 0;
  let previous: number | null = null;
  for (const day of [...days.values()].sort((a, b) => a - b)) {
    run = previous !== null && dayKey(addDays(previous, 1)) === dayKey(day) ? run + 1 : 1;
    best = Math.max(best, run);
    previous = day;
  }
  return { current, best };
}

export function activitySummary(attempts: readonly Attempt[], window: StatsWindow, now: number): ActivitySummary {
  const allDays = new Map<string, number>();
  for (const a of attempts) {
    const day = startOfDayLocal(a.at);
    allDays.set(dayKey(day), day);
  }
  const { current, best } = streaks(allDays, now);

  const windowed = attempts.filter((a) => inWindow(a.at, window, now));
  const totalMs = windowed.reduce((sum, a) => sum + capped(a), 0);
  const studyDays = new Set(windowed.map((a) => dayKey(a.at))).size;

  const perDay = new Map<string, number>();
  for (const a of attempts) perDay.set(dayKey(a.at), (perDay.get(dayKey(a.at)) ?? 0) + 1);
  const firstDay = addDays(startOfDayLocal(now), -(CALENDAR_DAYS - 1));
  const calendar = Array.from({ length: CALENDAR_DAYS }, (_, i) => {
    const day = addDays(firstDay, i);
    return { date: dayKey(day), count: perDay.get(dayKey(day)) ?? 0, weekday: (new Date(day).getDay() + 6) % 7 };
  });

  const earliest = attempts.reduce<number | null>((min, a) => (min === null || a.at < min ? a.at : min), null);
  const buckets = timeBuckets(window, now, earliest);
  const time = buckets.map((b) => ({ key: b.key, scheduledMs: 0, practiceMs: 0 }));
  const byHour = Array.from({ length: 24 }, () => 0);
  const byMode = { review: 0, writing: 0 };
  for (const a of windowed) {
    const i = findBucket(buckets, a.at);
    if (i !== -1) time[i]![a.source === 'practice' ? 'practiceMs' : 'scheduledMs'] += capped(a);
    byHour[new Date(a.at).getHours()]! += 1;
    byMode[a.mode] += 1;
  }

  return {
    currentStreak: current,
    bestStreak: best,
    daysStudied: studyDays,
    answers: windowed.length,
    totalMs,
    averageMs: windowed.length ? totalMs / windowed.length : 0,
    perStudyDay: studyDays ? windowed.length / studyDays : 0,
    calendar,
    time,
    byHour,
    byMode,
  };
}
```

`earliest` uses a `reduce`, not `Math.min(...)`, which overflows the stack on a long history.

Add `export * from './activity';` to `core/stats/index.ts`.

- [ ] **Step 4: Run the suite and typecheck**

Run: `npm test && npm run typecheck`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add core/stats test/stats
git commit -m "Aggregate study activity: streaks, time, calendar, hours"
```

---

### Task 9: Stats core — memory

**Files:**
- Create: `core/stats/memory.ts`
- Modify: `core/stats/index.ts`
- Test: `test/stats/memory.test.ts`

**Interfaces:**
- Consumes: Task 7 (`FilteredSnapshot`, time helpers).
- Produces:
  ```ts
  export const MATURE_DAYS = 21;
  export interface Ratio { right: number; total: number }
  export function rate(r: Ratio): number | null;
  export interface HardItem { itemId: string; cardId: string; hanzi: string; translation: string; mode: StudyMode; lapses: number; reviews: number; failures: number; failureRate: number }
  export interface MemorySummary {
    retention: { young: Ratio; mature: Ratio };
    retentionSeries: { key: string; young: number | null; mature: number | null }[];
    forecast: { date: string; count: number }[];   // 30 days, today first, overdue in today
    intervals: { label: string; count: number }[];
    cardStates: { new: number; learning: number; young: number; mature: number };
    answerMix: { again: number; hard: number; good: number; easy: number };
    hardest: HardItem[];                              // at most 20
  }
  export function memorySummary(f: Pick<FilteredSnapshot, 'reviews' | 'items' | 'itemsById' | 'cardsById'>, window: StatsWindow, now: number): MemorySummary;
  ```

- [ ] **Step 1: Failing tests**

`test/stats/memory.test.ts`:

```ts
import { describe, expect, it } from 'vitest';
import { memorySummary, rate } from '~core/stats/memory';
import { NOW, aCard, aReview, anItem, local } from './fixtures';

const DAY = 86_400_000;

function input(reviews = [] as ReturnType<typeof aReview>[], items = [anItem('c1', 'production')]) {
  return {
    reviews,
    items,
    itemsById: new Map(items.map((i) => [i.id, i])),
    cardsById: new Map([['c1', aCard('c1', 'd1')], ['c2', aCard('c2', 'd1', { hanzi: '習' })]]),
  };
}

describe('memorySummary', () => {
  it('measures retention on review-state answers only, young and mature apart', () => {
    const s = memorySummary(input([
      aReview('r1', 'c1:production', { grade: 3 }, { scheduledDays: 5 }),
      aReview('r2', 'c1:production', { grade: 1 }, { scheduledDays: 5 }),
      aReview('r3', 'c1:production', { grade: 4 }, { scheduledDays: 40 }),
      aReview('r4', 'c1:production', { grade: 1 }, { state: 'learning' }),
    ]), '30d', NOW);
    expect(s.retention).toEqual({ young: { right: 1, total: 2 }, mature: { right: 1, total: 1 } });
    expect(rate(s.retention.young)).toBe(0.5);
    expect(rate({ right: 0, total: 0 })).toBeNull();
  });

  it('leaves reviews outside the window out of retention and the answer mix', () => {
    const s = memorySummary(input([aReview('r1', 'c1:production', { reviewedAt: local(1, 1) })]), '30d', NOW);
    expect(s.retention.young.total).toBe(0);
    expect(s.answerMix).toEqual({ again: 0, hard: 0, good: 0, easy: 0 });
  });

  it('forecasts 30 days, overdue counted today, new items left out', () => {
    const items = [
      anItem('c1', 'production', { due: NOW - 5 * DAY }),
      anItem('c1', 'recognition', { due: NOW + 2 * DAY }),
      anItem('c2', 'production', { state: 'new', due: NOW }),
      anItem('c2', 'recognition', { due: NOW + 60 * DAY }),
    ];
    const s = memorySummary(input([], items), '30d', NOW);
    expect(s.forecast).toHaveLength(30);
    expect(s.forecast[0]).toEqual({ date: '2026-09-29', count: 1 });
    expect(s.forecast[2]!.count).toBe(1);
    expect(s.forecast.reduce((n, d) => n + d.count, 0)).toBe(2);
  });

  it('buckets the intervals of review items', () => {
    const items = [1, 3, 5, 10, 20, 60, 200].map((d, i) => anItem(`c${i}`, 'production', { scheduledDays: d }));
    const s = memorySummary(input([], items), '30d', NOW);
    expect(s.intervals.map((b) => b.count)).toEqual([1, 1, 1, 1, 1, 1, 1]);
    expect(s.intervals.map((b) => b.label)).toEqual(['1 d', '2–3 d', '4–7 d', '8–14 d', '15–30 d', '1–3 mo', 'Over 3 mo']);
  });

  it('counts card states', () => {
    const items = [anItem('c1', 'production', { state: 'new' }), anItem('c1', 'recognition', { state: 'relearning' }), anItem('c2', 'production', { scheduledDays: 30 }), anItem('c2', 'recognition')];
    expect(memorySummary(input([], items), '30d', NOW).cardStates).toEqual({ new: 1, learning: 1, young: 1, mature: 1 });
  });

  it('ranks the hardest items by lapses, then by failure rate', () => {
    const items = [anItem('c1', 'production', { lapses: 1 }), anItem('c2', 'production', { lapses: 3 })];
    const reviews = [aReview('r1', 'c1:production', { grade: 1 }), aReview('r2', 'c2:production', { grade: 3 })];
    const s = memorySummary(input(reviews, items), '30d', NOW);
    expect(s.hardest.map((h) => [h.hanzi, h.lapses, h.failures, h.reviews])).toEqual([['習', 3, 0, 1], ['學', 1, 1, 1]]);
  });
});
```

- [ ] **Step 2: Run to see it fail**

Run: `npx vitest run test/stats/memory.test.ts`
Expected: FAIL.

- [ ] **Step 3: Implement**

`core/stats/memory.ts`:

```ts
import { type Item, type StudyMode, DIRECTION_MODE } from '~core/db/schema';
import type { Grade } from '~core/srs';
import type { FilteredSnapshot } from './filter';
import { type StatsWindow, addDays, dayKey, findBucket, inWindow, startOfDayLocal, timeBuckets } from './time';

/** Above this interval a review item is mature — the threshold Browse and Today use. */
export const MATURE_DAYS = 21;

const FORECAST_DAYS = 30;
const HARDEST_LIMIT = 20;

export interface Ratio {
  right: number;
  total: number;
}

export function rate(r: Ratio): number | null {
  return r.total === 0 ? null : r.right / r.total;
}

export interface HardItem {
  itemId: string;
  cardId: string;
  hanzi: string;
  translation: string;
  mode: StudyMode;
  lapses: number;
  reviews: number;
  failures: number;
  failureRate: number;
}

export interface MemorySummary {
  retention: { young: Ratio; mature: Ratio };
  retentionSeries: { key: string; young: number | null; mature: number | null }[];
  forecast: { date: string; count: number }[];
  intervals: { label: string; count: number }[];
  cardStates: { new: number; learning: number; young: number; mature: number };
  answerMix: { again: number; hard: number; good: number; easy: number };
  hardest: HardItem[];
}

const GRADE_KEY: Record<Grade, keyof MemorySummary['answerMix']> = { 1: 'again', 2: 'hard', 3: 'good', 4: 'easy' };

const INTERVALS: { label: string; max: number }[] = [
  { label: '1 d', max: 1 },
  { label: '2–3 d', max: 3 },
  { label: '4–7 d', max: 7 },
  { label: '8–14 d', max: 14 },
  { label: '15–30 d', max: 30 },
  { label: '1–3 mo', max: 90 },
  { label: 'Over 3 mo', max: Infinity },
];

/**
 * How well the schedule is holding. Retention is true retention: the share
 * of answers right on items that were already in review (not learning), read
 * from the state each review captured before it was answered.
 */
export function memorySummary(
  f: Pick<FilteredSnapshot, 'reviews' | 'items' | 'itemsById' | 'cardsById'>,
  window: StatsWindow,
  now: number,
): MemorySummary {
  const windowed = f.reviews.filter((r) => inWindow(r.reviewedAt, window, now));
  const earliest = windowed.reduce<number | null>((min, r) => (min === null || r.reviewedAt < min ? r.reviewedAt : min), null);
  const buckets = timeBuckets(window, now, earliest);
  const perBucket = buckets.map(() => ({ young: { right: 0, total: 0 }, mature: { right: 0, total: 0 } }));

  const retention = { young: { right: 0, total: 0 }, mature: { right: 0, total: 0 } };
  const answerMix = { again: 0, hard: 0, good: 0, easy: 0 };
  for (const r of windowed) {
    answerMix[GRADE_KEY[r.grade]] += 1;
    if (r.before.state !== 'review') continue;
    const age = r.before.scheduledDays > MATURE_DAYS ? 'mature' : 'young';
    const right = r.grade > 1 ? 1 : 0;
    retention[age].total += 1;
    retention[age].right += right;
    const i = findBucket(buckets, r.reviewedAt);
    if (i !== -1) {
      perBucket[i]![age].total += 1;
      perBucket[i]![age].right += right;
    }
  }
  const retentionSeries = buckets.map((b, i) => ({ key: b.key, young: rate(perBucket[i]!.young), mature: rate(perBucket[i]!.mature) }));

  const today = startOfDayLocal(now);
  const forecast = Array.from({ length: FORECAST_DAYS }, (_, i) => ({ date: dayKey(addDays(today, i)), count: 0 }));
  const forecastEnds = forecast.map((_, i) => addDays(today, i + 1));
  const intervals = INTERVALS.map(({ label }) => ({ label, count: 0 }));
  const cardStates = { new: 0, learning: 0, young: 0, mature: 0 };
  for (const item of f.items) {
    if (item.state === 'new') cardStates.new += 1;
    else if (item.state === 'learning' || item.state === 'relearning') cardStates.learning += 1;
    else if (item.scheduledDays > MATURE_DAYS) cardStates.mature += 1;
    else cardStates.young += 1;

    if (item.state !== 'new') {
      const day = forecastEnds.findIndex((end) => item.due < end);
      if (day !== -1) forecast[day]!.count += 1;
    }
    if (item.state === 'review') intervals[INTERVALS.findIndex((b) => item.scheduledDays <= b.max)]!.count += 1;
  }

  return { retention, retentionSeries, forecast, intervals, cardStates, answerMix, hardest: hardest(f) };
}

function hardest(f: Pick<FilteredSnapshot, 'reviews' | 'items' | 'cardsById'>): HardItem[] {
  const tally = new Map<string, { reviews: number; failures: number }>();
  for (const r of f.reviews) {
    const t = tally.get(r.itemId) ?? { reviews: 0, failures: 0 };
    t.reviews += 1;
    if (r.grade === 1) t.failures += 1;
    tally.set(r.itemId, t);
  }
  const rows: HardItem[] = [];
  for (const item of f.items as Item[]) {
    const t = tally.get(item.id) ?? { reviews: 0, failures: 0 };
    if (item.lapses === 0 && t.failures === 0) continue;
    const card = f.cardsById.get(item.cardId);
    rows.push({
      itemId: item.id,
      cardId: item.cardId,
      hanzi: card?.hanzi ?? '—',
      translation: card?.translation ?? '',
      mode: DIRECTION_MODE[item.dir],
      lapses: item.lapses,
      reviews: t.reviews,
      failures: t.failures,
      failureRate: t.reviews ? t.failures / t.reviews : 0,
    });
  }
  return rows.sort((a, b) => b.lapses - a.lapses || b.failureRate - a.failureRate).slice(0, HARDEST_LIMIT);
}
```

In `core/db/repositories.ts`, replace the local `MATURE_SCHEDULED_DAYS = 21` with an import of `MATURE_DAYS` from `~core/stats/memory` so there is one threshold (keep the name `MATURE_SCHEDULED_DAYS` as a local alias only if renaming its two uses is noisy).

Add `export * from './memory';` to `core/stats/index.ts`.

- [ ] **Step 4: Run the suite and typecheck**

Run: `npm test && npm run typecheck`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add core/stats core/db/repositories.ts test/stats
git commit -m "Aggregate memory: true retention, forecast, intervals, hardest cards"
```

---

### Task 10: Stats core — writing and journal

**Files:**
- Create: `core/stats/writing.ts`, `core/stats/journal.ts`
- Modify: `core/stats/index.ts`
- Test: `test/stats/writing.test.ts`, `test/stats/journal.test.ts`

**Interfaces:**
- Consumes: Tasks 7, 9 (`Ratio`, `rate`).
- Produces:
  ```ts
  // writing.ts
  export interface MissedCharacter { character: string; attempts: number; shapeRate: number; orderRate: number | null; lastError: WritingError | null; lastAt: number }
  export interface WritingSummary {
    character: Ratio;   // drawn characters with the right shape
    order: Ratio;       // of those, the ones in the right order
    checked: Ratio;     // writing answers checked by the app
    series: { key: string; character: number | null; order: number | null }[];
    errors: Record<WritingError, number>;
    missed: MissedCharacter[];  // at most 30
  }
  export function writingSummary(attempts: readonly Attempt[], window: StatsWindow, now: number): WritingSummary;
  // journal.ts
  export interface JournalFilter { source: AttemptSource | null; result: 'right' | 'wrong' | null }
  export interface JournalRow { id: string; at: number; cardId: string; hanzi: string; deckName: string; mode: StudyMode; source: AttemptSource; grade: Grade; durationMs: number; verdict: string }
  export function attemptVerdict(a: Pick<Attempt, 'mode' | 'checked' | 'writing'>): string;
  export function journalRows(f: Pick<FilteredSnapshot, 'attempts' | 'cardsById' | 'decksById'>, window: StatsWindow, now: number, filter: JournalFilter): JournalRow[];
  ```

- [ ] **Step 1: Failing tests**

`test/stats/writing.test.ts`:

```ts
import { describe, expect, it } from 'vitest';
import type { WritingResult } from '~core/db/schema';
import { writingSummary } from '~core/stats/writing';
import { NOW, anAttempt, local } from './fixtures';

const r = (character: string, over: Partial<WritingResult> = {}): WritingResult => ({
  character, shapeCorrect: true, orderCorrect: true, error: null, strokeIndex: null, expected: 4, drawn: 4, ...over,
});

describe('writingSummary', () => {
  const attempts = [
    anAttempt('a', { checked: true, writing: [r('學'), r('習', { orderCorrect: false, error: 'stroke-order', strokeIndex: 1 })] }),
    anAttempt('b', { checked: true, writing: [r('習', { shapeCorrect: false, orderCorrect: false, error: 'stroke-count', drawn: 3 })], at: NOW + 1 }),
    anAttempt('c', { checked: false, writing: null }),
    anAttempt('d', { mode: 'review' }),
  ];

  it('measures the character over drawn characters, and the order over right shapes', () => {
    const s = writingSummary(attempts, '30d', NOW);
    expect(s.character).toEqual({ right: 2, total: 3 });
    expect(s.order).toEqual({ right: 1, total: 2 });
    expect(s.checked).toEqual({ right: 2, total: 3 });
  });

  it('counts each kind of error', () => {
    expect(writingSummary(attempts, '30d', NOW).errors).toEqual({ 'stroke-count': 1, 'stroke-shape': 0, 'stroke-order': 1, 'stroke-direction': 0 });
  });

  it('lists the characters missed most, with their last error', () => {
    expect(writingSummary(attempts, '30d', NOW).missed).toEqual([
      { character: '習', attempts: 2, shapeRate: 0.5, orderRate: 0, lastError: 'stroke-count', lastAt: NOW + 1 },
    ]);
  });

  it('ignores answers outside the window', () => {
    expect(writingSummary([anAttempt('old', { at: local(1, 1), checked: true, writing: [r('學')] })], '30d', NOW).character.total).toBe(0);
  });
});
```

`test/stats/journal.test.ts`:

```ts
import { describe, expect, it } from 'vitest';
import { attemptVerdict, journalRows } from '~core/stats/journal';
import { NOW, aCard, aDeck, anAttempt, local } from './fixtures';

const f = {
  attempts: [
    anAttempt('old', { at: local(9, 20), grade: 1, correct: false }),
    anAttempt('new', { at: local(9, 29), source: 'practice' }),
    anAttempt('orphan', { at: local(9, 28), cardId: 'gone', deckId: 'gone' }),
  ],
  cardsById: new Map([['c1', aCard('c1', 'd1')]]),
  decksById: new Map([['d1', aDeck('d1')]]),
};

describe('journalRows', () => {
  it('lists answers newest first, and survives a deleted card and deck', () => {
    const rows = journalRows(f, '30d', NOW, { source: null, result: null });
    expect(rows.map((r) => r.id)).toEqual(['new', 'orphan', 'old']);
    expect(rows[1]).toMatchObject({ hanzi: '—', deckName: '—' });
    expect(rows[0]).toMatchObject({ hanzi: '學', deckName: 'D1', source: 'practice' });
  });

  it('filters by source and result', () => {
    expect(journalRows(f, '30d', NOW, { source: 'practice', result: null }).map((r) => r.id)).toEqual(['new']);
    expect(journalRows(f, '30d', NOW, { source: null, result: 'wrong' }).map((r) => r.id)).toEqual(['old']);
  });
});

describe('attemptVerdict', () => {
  const w = (shapeCorrect: boolean, orderCorrect: boolean) => ({ character: '學', shapeCorrect, orderCorrect, error: null, strokeIndex: null, expected: 1, drawn: 1 });
  it('describes a checked drawing', () => {
    expect(attemptVerdict({ mode: 'writing', checked: true, writing: [w(true, true)] })).toBe('Character right · order right');
    expect(attemptVerdict({ mode: 'writing', checked: true, writing: [w(true, false)] })).toBe('Character right · order wrong');
    expect(attemptVerdict({ mode: 'writing', checked: true, writing: [w(false, false)] })).toBe('Character wrong · order not checked');
  });
  it('says when a writing answer was self-graded, and nothing for review', () => {
    expect(attemptVerdict({ mode: 'writing', checked: false, writing: null })).toBe('Self-graded');
    expect(attemptVerdict({ mode: 'review', checked: false, writing: null })).toBe('');
  });
});
```

- [ ] **Step 2: Run to see them fail**

Run: `npx vitest run test/stats/writing.test.ts test/stats/journal.test.ts`
Expected: FAIL.

- [ ] **Step 3: `core/stats/writing.ts`**

```ts
import type { WritingError } from '~core/chinese/strokes';
import type { Attempt, WritingResult } from '~core/db/schema';
import { type Ratio, rate } from './memory';
import { type StatsWindow, findBucket, inWindow, timeBuckets } from './time';

const MISSED_LIMIT = 30;

export interface MissedCharacter {
  character: string;
  attempts: number;
  shapeRate: number;
  /** Share in the right order among the right shapes; `null` when no shape was right. */
  orderRate: number | null;
  lastError: WritingError | null;
  lastAt: number;
}

export interface WritingSummary {
  character: Ratio;
  order: Ratio;
  checked: Ratio;
  series: { key: string; character: number | null; order: number | null }[];
  errors: Record<WritingError, number>;
  missed: MissedCharacter[];
}

const add = (r: Ratio, right: boolean) => {
  r.total += 1;
  if (right) r.right += 1;
};

/**
 * Writing accuracy, per drawn character. The order is judged only where the
 * shape was right, so its ratio counts those characters alone.
 */
export function writingSummary(attempts: readonly Attempt[], window: StatsWindow, now: number): WritingSummary {
  const writing = attempts.filter((a) => a.mode === 'writing' && inWindow(a.at, window, now));
  const earliest = writing.reduce<number | null>((min, a) => (min === null || a.at < min ? a.at : min), null);
  const buckets = timeBuckets(window, now, earliest);
  const perBucket = buckets.map(() => ({ character: { right: 0, total: 0 }, order: { right: 0, total: 0 } }));

  const character = { right: 0, total: 0 };
  const order = { right: 0, total: 0 };
  const checked = { right: 0, total: 0 };
  const errors: Record<WritingError, number> = { 'stroke-count': 0, 'stroke-shape': 0, 'stroke-order': 0, 'stroke-direction': 0 };
  const byCharacter = new Map<string, { results: { r: WritingResult; at: number }[] }>();

  for (const a of writing) {
    add(checked, a.checked);
    const i = findBucket(buckets, a.at);
    for (const r of a.writing ?? []) {
      add(character, r.shapeCorrect);
      if (r.shapeCorrect) add(order, r.orderCorrect);
      if (i !== -1) {
        add(perBucket[i]!.character, r.shapeCorrect);
        if (r.shapeCorrect) add(perBucket[i]!.order, r.orderCorrect);
      }
      if (r.error) errors[r.error] += 1;
      const entry = byCharacter.get(r.character) ?? { results: [] };
      entry.results.push({ r, at: a.at });
      byCharacter.set(r.character, entry);
    }
  }

  const missed: MissedCharacter[] = [];
  for (const [char, { results }] of byCharacter) {
    const faults = results.filter(({ r }) => r.error !== null);
    if (faults.length === 0) continue;
    const shapes = results.filter(({ r }) => r.shapeCorrect);
    const last = faults.reduce((x, y) => (y.at > x.at ? y : x));
    missed.push({
      character: char,
      attempts: results.length,
      shapeRate: shapes.length / results.length,
      orderRate: shapes.length ? shapes.filter(({ r }) => r.orderCorrect).length / shapes.length : null,
      lastError: last.r.error,
      lastAt: last.at,
    });
  }
  missed.sort((x, y) => x.shapeRate - y.shapeRate || (x.orderRate ?? 0) - (y.orderRate ?? 0) || y.lastAt - x.lastAt);

  return {
    character,
    order,
    checked,
    series: buckets.map((b, i) => ({ key: b.key, character: rate(perBucket[i]!.character), order: rate(perBucket[i]!.order) })),
    errors,
    missed: missed.slice(0, MISSED_LIMIT),
  };
}
```

Check the `missed` test: 習 has two results — one shape right / order wrong (stroke-order), one shape wrong (stroke-count). `shapeRate` 1/2, `orderRate` 0/1 = 0, last fault at `NOW + 1` is stroke-count ✔. 學 has no fault, so it is left out ✔.

- [ ] **Step 4: `core/stats/journal.ts`**

```ts
import type { Attempt, AttemptSource, StudyMode } from '~core/db/schema';
import type { Grade } from '~core/srs';
import type { FilteredSnapshot } from './filter';
import { type StatsWindow, inWindow } from './time';

export interface JournalFilter {
  source: AttemptSource | null;
  result: 'right' | 'wrong' | null;
}

export interface JournalRow {
  id: string;
  at: number;
  cardId: string;
  hanzi: string;
  deckName: string;
  mode: StudyMode;
  source: AttemptSource;
  grade: Grade;
  durationMs: number;
  verdict: string;
}

/** One line on how a writing answer was judged; empty for Review. */
export function attemptVerdict(a: Pick<Attempt, 'mode' | 'checked' | 'writing'>): string {
  if (a.mode !== 'writing') return '';
  if (!a.checked || !a.writing) return 'Self-graded';
  const shape = a.writing.every((r) => r.shapeCorrect);
  const order = a.writing.every((r) => r.orderCorrect) ? 'order right' : a.writing.some((r) => r.shapeCorrect && !r.orderCorrect) ? 'order wrong' : 'order not checked';
  return `Character ${shape ? 'right' : 'wrong'} · ${order}`;
}

/** Every answer in the window, newest first. A deleted card or deck shows as "—". */
export function journalRows(
  f: Pick<FilteredSnapshot, 'attempts' | 'cardsById' | 'decksById'>,
  window: StatsWindow,
  now: number,
  filter: JournalFilter,
): JournalRow[] {
  return f.attempts
    .filter((a) => inWindow(a.at, window, now))
    .filter((a) => filter.source === null || a.source === filter.source)
    .filter((a) => filter.result === null || a.correct === (filter.result === 'right'))
    .sort((a, b) => b.at - a.at)
    .map((a) => ({
      id: a.id,
      at: a.at,
      cardId: a.cardId,
      hanzi: f.cardsById.get(a.cardId)?.hanzi ?? '—',
      deckName: f.decksById.get(a.deckId)?.name ?? '—',
      mode: a.mode,
      source: a.source,
      grade: a.grade,
      durationMs: a.durationMs,
      verdict: attemptVerdict(a),
    }));
}
```

Add `export * from './writing';` and `export * from './journal';` to `core/stats/index.ts`.

- [ ] **Step 5: Run the suite and typecheck**

Run: `npm test && npm run typecheck`
Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add core/stats test/stats
git commit -m "Aggregate writing accuracy and build the answer journal"
```

---

### Task 11: Snapshot, `useStats` and the stats page shell with Activity

**Files:**
- Modify: `core/db/repositories.ts` (replace `stats.summary` with `stats.snapshot`), `app/composables/useStats.ts`, `app/pages/stats.vue`
- Create: `app/components/stats/StatsActivity.vue`, `app/components/stats/ActivityCalendar.vue`, `app/utils/format.ts` (if no duration/percent formatter exists — check `core/srs` `formatInterval` first)
- Test: `test/db/repositories.test.ts` (replace the `stats.summary` block), `test/composables/useStats.test.ts` (new)

**Interfaces:**
- Consumes: Tasks 7–10.
- Produces:
  - `stats.snapshot(): Promise<StatsSnapshot>` in repositories.
  - `useStats()` → `{ loading: Ref<boolean>, loadError: Ref<boolean>, filter: StatsFilter (reactive), filtered: ComputedRef<FilteredSnapshot | null>, deckOptions: ComputedRef<{ value: string; label: string }[]>, now: Ref<number>, load(): Promise<void> }`
  - `app/utils/format.ts`: `formatDuration(ms: number): string` ("0 min", "12 min", "3 h 5 min", "8 s" under a minute), `formatPercent(value: number | null): string` ("—" for null, else "87%").

- [ ] **Step 1: Failing tests**

In `test/db/repositories.test.ts`, delete the `describe('stats.summary', …)` block (its streak cases now live in `test/stats/activity.test.ts`) and add:

```ts
describe('stats.snapshot', () => {
  it('reads every table the Statistics page needs', async () => {
    await decks.put(aDeck());
    await cards.create(aCard(), ['recognition'], NOW);
    const item = (await items.get(itemId('c1', 'recognition')))!;
    await reviews.record({ item, before: item, grade: 3, reviewedAt: NOW, durationMs: 1 });
    const s = await stats.snapshot();
    expect([s.decks.length, s.cards.length, s.items.length, s.reviews.length, s.attempts.length]).toEqual([1, 1, 1, 1, 1]);
  });
});
```

`test/composables/useStats.test.ts`:

```ts
import 'fake-indexeddb/auto';
import { beforeEach, describe, expect, it } from 'vitest';
import { useStats } from '~/composables/useStats';
import { db } from '~core/db/db';
import { cards, decks } from '~core/db/repositories';

const NOW = Date.parse('2026-09-16T08:00:00Z');
const aDeck = (id: string, deletedAt: number | null = null) => ({ id, name: id, description: '', colorToken: 'var(--chart-series-1)', tag: '', translationLang: 'en', createdAt: NOW, updatedAt: NOW, deletedAt });

beforeEach(async () => {
  await db.delete();
  await db.open();
  await decks.put(aDeck('d1'));
  await decks.put(aDeck('d2', NOW));
  await cards.create({ id: 'c1', deckId: 'd1', hanzi: '學', pinyin: [], zhuyin: '', translation: 'study', pos: 'verb', example: '', examplePinyin: '', exampleTranslation: '', tags: [], note: '', createdAt: NOW, updatedAt: NOW, deletedAt: null }, ['recognition', 'production'], NOW);
});

describe('useStats', () => {
  it('loads a snapshot and filters it', async () => {
    const s = useStats();
    await s.load();
    expect(s.filtered.value?.items).toHaveLength(2);
    s.filter.mode = 'writing';
    expect(s.filtered.value?.items.map((i) => i.dir)).toEqual(['production']);
  });

  it('offers live decks only', async () => {
    const s = useStats();
    await s.load();
    expect(s.deckOptions.value).toEqual([{ value: 'd1', label: 'd1' }]);
  });
});
```

- [ ] **Step 2: Run to see them fail**

Run: `npx vitest run test/db/repositories.test.ts test/composables/useStats.test.ts`
Expected: FAIL.

- [ ] **Step 3: Repository**

In `core/db/repositories.ts`, delete `STATS_WINDOW_DAYS`, `startOfDayLocal`, `dayKey`, `GRADE_KEY`, `StatsSummary`, `currentStreak` and `stats.summary` (check with `grep -rn "startOfDayLocal\|dayKey\|StatsSummary" core app test` that nothing else uses them; if something does, import it from `~core/stats/time` instead). Replace `stats` with:

```ts
export const stats = {
  /**
   * Everything the Statistics page aggregates, read once when it opens.
   * The aggregates themselves are pure (`core/stats`); this is the one place
   * that reads the tables for them, through `useStats`.
   */
  async snapshot(): Promise<StatsSnapshot> {
    const [attemptRows, reviewRows, itemRows, cardRows, deckRows] = await Promise.all([
      db.attempts.toArray(),
      db.reviews.toArray(),
      db.items.toArray(),
      db.cards.toArray(),
      db.decks.toArray(),
    ]);
    return { attempts: attemptRows, reviews: reviewRows, items: itemRows, cards: cardRows, decks: deckRows };
  },
};
```

with `import type { StatsSnapshot } from '~core/stats/filter';`.

- [ ] **Step 4: `useStats`**

```ts
import { stats } from '~core/db/repositories';
import { type FilteredSnapshot, type StatsFilter, type StatsSnapshot, applyFilter } from '~core/stats';

/**
 * The Statistics page's one seam into the database (pages never touch Dexie
 * or a repository directly). Reads one snapshot when the page opens; the
 * filter recomputes everything from it in memory. Holds no shared state —
 * each page visit reads afresh.
 */
export function useStats() {
  const snapshot = shallowRef<StatsSnapshot | null>(null);
  const loading = ref(true);
  const loadError = ref(false);
  const now = ref(Date.now());
  const filter = reactive<StatsFilter>({ window: '30d', deckId: null, mode: null });

  const filtered = computed<FilteredSnapshot | null>(() =>
    snapshot.value ? applyFilter(snapshot.value, { deckId: filter.deckId, mode: filter.mode }) : null,
  );

  const deckOptions = computed(() =>
    (snapshot.value?.decks ?? [])
      .filter((d) => d.deletedAt === null)
      .sort((a, b) => a.name.localeCompare(b.name))
      .map((d) => ({ value: d.id, label: d.name })),
  );

  async function load(): Promise<void> {
    loading.value = true;
    loadError.value = false;
    try {
      snapshot.value = await stats.snapshot();
      now.value = Date.now();
    } catch (err) {
      console.error('stats: failed to load the snapshot', err);
      loadError.value = true;
    } finally {
      loading.value = false;
    }
  }

  return { loading, loadError, filter, filtered, deckOptions, now, load };
}
```

- [ ] **Step 5: Formatters**

`app/utils/format.ts`:

```ts
/** "8 s", "12 min", "3 h 5 min" — study time, never a countdown. */
export function formatDuration(ms: number): string {
  const seconds = Math.round(ms / 1000);
  if (seconds < 60) return `${seconds} s`;
  const minutes = Math.round(seconds / 60);
  if (minutes < 60) return `${minutes} min`;
  const h = Math.floor(minutes / 60);
  const m = minutes % 60;
  return m ? `${h} h ${m} min` : `${h} h`;
}

/** "87%", or "—" when there is nothing to measure. */
export function formatPercent(value: number | null): string {
  return value === null ? '—' : `${Math.round(value * 100)}%`;
}

/** `9/23` from `2026-09-23` — short enough for 30 tick labels at phone width. */
export function shortDate(key: string): string {
  return `${Number(key.slice(5, 7))}/${Number(key.slice(8, 10))}`;
}
```

Add `test/utils/format.test.ts`:

```ts
import { describe, expect, it } from 'vitest';
import { formatDuration, formatPercent, shortDate } from '~/utils/format';

describe('format', () => {
  it('formats durations', () => {
    expect([formatDuration(8_000), formatDuration(720_000), formatDuration(11_100_000), formatDuration(7_200_000)]).toEqual(['8 s', '12 min', '3 h 5 min', '2 h']);
  });
  it('formats percentages', () => {
    expect([formatPercent(null), formatPercent(0.874)]).toEqual(['—', '87%']);
  });
  it('shortens a day key', () => {
    expect(shortDate('2026-09-03')).toBe('9/3');
  });
});
```

- [ ] **Step 6: `ActivityCalendar.vue`**

```vue
<script setup lang="ts">
import type { ActivitySummary } from '~core/stats';

/**
 * A year of study, one square per day, darker for more answers. Kanto has
 * no heatmap, so this is a hand-drawn SVG; each day's count reaches assistive
 * tech through a `title`, and the colours come from the primary tokens.
 */
const props = defineProps<{ days: ActivitySummary['calendar'] }>();

/** viewBox units: a 12-unit cell with a 2-unit gap. */
const CELL = 12;
const STEP = 14;

const max = computed(() => Math.max(1, ...props.days.map((d) => d.count)));
const cells = computed(() => {
  const offset = props.days[0]?.weekday ?? 0;
  return props.days.map((d, i) => {
    const slot = i + offset;
    const level = d.count === 0 ? 0 : Math.min(4, Math.ceil((d.count / max.value) * 4));
    return { ...d, x: Math.floor(slot / 7) * STEP, y: (slot % 7) * STEP, level };
  });
});
const width = computed(() => (Math.floor((props.days.length + (props.days[0]?.weekday ?? 0) - 1) / 7) + 1) * STEP);
</script>

<template>
  <svg class="calendar" :viewBox="`0 0 ${width} ${7 * STEP}`" role="img" aria-label="Answers per day over the last year">
    <rect v-for="c in cells" :key="c.date" :x="c.x" :y="c.y" :width="CELL" :height="CELL" rx="2" :class="`level-${c.level}`">
      <title>{{ c.date }}: {{ c.count }} answer{{ c.count === 1 ? '' : 's' }}</title>
    </rect>
  </svg>
</template>

<style scoped>
.calendar { display: block; width: 100%; height: auto; }
.level-0 { fill: var(--surface-field); }
.level-1 { fill: var(--color-primary-soft); }
.level-2 { fill: color-mix(in srgb, var(--color-primary-base) 45%, var(--surface-field)); }
.level-3 { fill: color-mix(in srgb, var(--color-primary-base) 75%, var(--surface-field)); }
.level-4 { fill: var(--color-primary-base); }
</style>
```

(`rx="2"` is viewBox geometry, not a radius token; the spec's `kt-tooltip` per day would mean 371 Kanto elements — `title` does the same job without the weight. Note this deviation in the commit body.)

- [ ] **Step 7: `StatsActivity.vue`**

```vue
<script setup lang="ts">
import { type FilteredSnapshot, type StatsWindow, activitySummary } from '~core/stats';
import { formatDuration, shortDate } from '~/utils/format';

const props = defineProps<{ data: FilteredSnapshot; window: StatsWindow; now: number }>();

const s = computed(() => activitySummary(props.data.attempts, props.window, props.now));
const days = (n: number) => `${n} day${n === 1 ? '' : 's'}`;
const minutes = (ms: number) => Math.round(ms / 60_000);
const hours = Array.from({ length: 24 }, (_, h) => String(h));
</script>

<template>
  <kt-empty-state v-if="data.attempts.length === 0" icon="chart-line" heading="No answers yet" description="Study a few cards to see your activity here.">
    <kt-button slot="actions" variant="primary" size="medium" icon="play" @click="navigateTo('/review')">Start reviewing</kt-button>
  </kt-empty-state>

  <div v-else class="tab">
    <div class="tiles">
      <kt-stat label="Current streak" :value="days(s.currentStreak)" icon="flame" />
      <kt-stat label="Best streak" :value="days(s.bestStreak)" icon="trophy" />
      <kt-stat label="Days studied" :value="String(s.daysStudied)" />
      <kt-stat label="Time studied" :value="formatDuration(s.totalMs)" icon="clock" />
      <kt-stat label="Per answer" :value="formatDuration(s.averageMs)" />
      <kt-stat label="Answers per day" :value="s.perStudyDay.toFixed(1)" />
    </div>

    <kt-card>
      <div slot="header" class="card-heading">Last year</div>
      <ActivityCalendar :days="s.calendar" />
    </kt-card>

    <kt-card>
      <div slot="header" class="card-heading">Minutes studied</div>
      <kt-chart
        type="bar"
        stacked
        label="Minutes studied"
        height="220"
        :labels="s.time.map((t) => shortDate(t.key))"
        :series="[
          { name: 'Scheduled', values: s.time.map((t) => minutes(t.scheduledMs)) },
          { name: 'Practice', values: s.time.map((t) => minutes(t.practiceMs)) },
        ]"
      />
    </kt-card>

    <div class="pair">
      <kt-card>
        <div slot="header" class="card-heading">Answers by hour</div>
        <kt-chart type="bar" label="Answers by hour" height="200" :labels="hours" :series="[{ name: 'Answers', values: s.byHour }]" />
      </kt-card>
      <kt-card>
        <div slot="header" class="card-heading">Review and writing</div>
        <kt-chart type="doughnut" label="Answers by mode" height="200" center-label="Answers" :labels="['Review', 'Writing']" :series="[{ name: 'Answers', values: [s.byMode.review, s.byMode.writing] }]" />
      </kt-card>
    </div>
  </div>
</template>

<style scoped>
.tab { display: flex; flex-direction: column; gap: var(--gap-card); }
.tiles { display: grid; grid-template-columns: repeat(auto-fit, minmax(140px, 1fr)); gap: var(--gap-button); }
.pair { display: grid; grid-template-columns: repeat(auto-fit, minmax(280px, 1fr)); gap: var(--gap-card); }
.card-heading { font: var(--font-title-h6); color: var(--text-body); }
</style>
```

If `trophy` or `clock` is not a Lucide icon Kanto ships, drop the `icon`.

- [ ] **Step 8: `stats.vue`**

```vue
<script setup lang="ts">
import { useStats } from '~/composables/useStats';

const { loading, loadError, filter, filtered, deckOptions, now, load } = useStats();

const tab = ref<'activity' | 'memory' | 'writing' | 'journal'>('activity');
const tabs = [
  { value: 'activity', label: 'Activity' },
  { value: 'memory', label: 'Memory' },
  { value: 'writing', label: 'Writing' },
  { value: 'journal', label: 'Journal' },
];
const windows = [
  { value: '7d', label: '7 d' },
  { value: '30d', label: '30 d' },
  { value: '90d', label: '90 d' },
  { value: '1y', label: '1 y' },
  { value: 'all', label: 'All' },
];
const modes = [
  { value: 'all', label: 'All' },
  { value: 'review', label: 'Review' },
  { value: 'writing', label: 'Writing' },
];

onMounted(load);
</script>

<template>
  <div class="stats">
    <kt-page-header eyebrow="Progress" heading="Statistics" description="Activity, memory, writing and every answer you gave." />

    <kt-skeleton v-if="loading" height="200px" />

    <kt-empty-state v-else-if="loadError" icon="triangle-alert" heading="Couldn't load your stats" description="Something went wrong reading the database. Try again.">
      <kt-button slot="actions" variant="secondary" size="medium" icon="refresh-cw" @click="load">Retry</kt-button>
    </kt-empty-state>

    <template v-else-if="filtered">
      <div class="filters">
        <kt-segmented-control size="small" label="Period" :options="windows" :value="filter.window" @kt-change="(e: CustomEvent) => (filter.window = e.detail.value)" />
        <kt-segmented-control size="small" label="Mode" :options="modes" :value="filter.mode ?? 'all'" @kt-change="(e: CustomEvent) => (filter.mode = e.detail.value === 'all' ? null : e.detail.value)" />
        <kt-select size="small" label="Deck" placeholder="All decks" clearable :options="deckOptions" :value="filter.deckId" @kt-change="(e: CustomEvent) => (filter.deckId = e.detail?.value ?? null)" />
      </div>

      <kt-tabs label="Statistics" :tabs="tabs" :value="tab" @kt-change="(e: CustomEvent) => (tab = e.detail.value)" />

      <StatsActivity v-if="tab === 'activity'" :data="filtered" :window="filter.window" :now="now" />
    </template>
  </div>
</template>

<style scoped>
.stats { display: flex; flex-direction: column; gap: var(--gap-card); }
.filters { display: flex; flex-wrap: wrap; align-items: end; gap: var(--gap-button); }
</style>
```

Check `kt-select`'s `kt-change` detail in its `.d.ts` (the comment says "An option was chosen or cleared") and read the value the way `DeckFormModal.vue` does. Nuxt auto-imports components under `app/components/stats/` as `StatsActivity` only if the folder prefix rule is on; if it resolves as `StatsStatsActivity`, import the components explicitly in `stats.vue`.

- [ ] **Step 9: Run the suite and typecheck**

Run: `npm test && npm run typecheck`
Expected: PASS, integrity test included (no native watched elements).

- [ ] **Step 10: Check it in the app**

Run `npm run dev`, open `/stats`. Expect the filters, the tabs and Activity: tiles, a year calendar, minutes per day stacked scheduled/practice, answers by hour, the mode doughnut. Switch the period and mode: figures change without reloading. Check at phone width (390 px): no horizontal scroll; the filters wrap.

- [ ] **Step 11: Commit**

```bash
git add core/db/repositories.ts app/composables/useStats.ts app/pages/stats.vue app/components/stats app/utils/format.ts test/db/repositories.test.ts test/composables/useStats.test.ts test/utils/format.test.ts
git commit -m "Rebuild Statistics on a snapshot, with filters and an Activity tab"
```

---

### Task 12: Memory, Writing and Journal tabs

**Files:**
- Create: `app/components/stats/StatsMemory.vue`, `app/components/stats/StatsWriting.vue`, `app/components/stats/StatsJournal.vue`
- Modify: `app/pages/stats.vue`

**Interfaces:**
- Consumes: `memorySummary`, `writingSummary`, `journalRows`, `rate` (Tasks 9–10), `formatDuration`, `formatPercent`, `shortDate` (Task 11), `StrokeOrderPanel` (Task 5), `useStrokeData`.
- Produces: three components with props `{ data: FilteredSnapshot; window: StatsWindow; now: number }`.

- [ ] **Step 1: `StatsMemory.vue`**

```vue
<script setup lang="ts">
import type { KtTableColumn, KtTableRow } from 'kanto-ds';
import { html } from 'lit';
import { type FilteredSnapshot, type HardItem, type StatsWindow, memorySummary, rate } from '~core/stats';
import { formatPercent, shortDate } from '~/utils/format';

const props = defineProps<{ data: FilteredSnapshot; window: StatsWindow; now: number }>();
const s = computed(() => memorySummary(props.data, props.window, props.now));
const pct = (v: number | null) => (v === null ? null : Math.round(v * 100));

const columns: KtTableColumn[] = [
  { key: 'hanzi', label: 'Card' },
  { key: 'translation', label: 'Meaning' },
  { key: 'mode', label: 'Mode' },
  { key: 'lapses', label: 'Lapses', align: 'right' },
  { key: 'failureRate', label: 'Missed', align: 'right' },
];

/** Renders inside kt-table's shadow root, so styling is inline and uses tokens. */
function renderCell(row: KtTableRow, column: KtTableColumn): unknown {
  const r = row as unknown as HardItem;
  if (column.key === 'hanzi') return html`<span style="font-family: var(--fk-font-hanzi)">${r.hanzi}</span>`;
  if (column.key === 'mode') return r.mode === 'writing' ? 'Writing' : 'Review';
  if (column.key === 'failureRate') return `${formatPercent(r.failureRate)} of ${r.reviews}`;
  return undefined;
}

function openCard(event: CustomEvent<{ row: HardItem }>): void {
  void navigateTo(`/cards/${event.detail.row.cardId}`);
}
</script>

<template>
  <div class="tab">
    <div class="tiles">
      <kt-stat label="Retention, young" :value="formatPercent(rate(s.retention.young))" :caption="`${s.retention.young.total} answers`" />
      <kt-stat label="Retention, mature" :value="formatPercent(rate(s.retention.mature))" :caption="`${s.retention.mature.total} answers`" />
      <kt-stat label="New" :value="String(s.cardStates.new)" />
      <kt-stat label="Learning" :value="String(s.cardStates.learning)" />
      <kt-stat label="Young" :value="String(s.cardStates.young)" />
      <kt-stat label="Mature" :value="String(s.cardStates.mature)" />
    </div>

    <kt-card v-if="s.retentionSeries.length">
      <div slot="header" class="card-heading">Retention, %</div>
      <kt-chart
        type="line"
        label="Retention"
        height="220"
        :labels="s.retentionSeries.map((p) => shortDate(p.key))"
        :series="[
          { name: 'Young', values: s.retentionSeries.map((p) => pct(p.young)) },
          { name: 'Mature', values: s.retentionSeries.map((p) => pct(p.mature)) },
        ]"
      />
    </kt-card>

    <kt-card>
      <div slot="header" class="card-heading">Due in the next 30 days</div>
      <kt-chart type="bar" label="Cards due per day" height="220" :labels="s.forecast.map((d) => shortDate(d.date))" :series="[{ name: 'Due', values: s.forecast.map((d) => d.count) }]" />
    </kt-card>

    <div class="pair">
      <kt-card>
        <div slot="header" class="card-heading">Intervals</div>
        <kt-chart type="bar" label="Cards by interval" height="200" :labels="s.intervals.map((b) => b.label)" :series="[{ name: 'Cards', values: s.intervals.map((b) => b.count) }]" />
      </kt-card>
      <kt-card>
        <div slot="header" class="card-heading">Answer mix</div>
        <kt-chart type="doughnut" label="Answer mix" height="200" center-label="Reviews" :labels="['Again', 'Hard', 'Good', 'Easy']" :series="[{ name: 'Reviews', values: [s.answerMix.again, s.answerMix.hard, s.answerMix.good, s.answerMix.easy] }]" />
      </kt-card>
    </div>

    <kt-card>
      <div slot="header" class="card-heading">Hardest cards</div>
      <kt-table label="Hardest cards" :columns="columns" :data="s.hardest" :renderCell="renderCell" compact empty-text="No lapses yet." @kt-row-click="openCard" />
    </kt-card>
  </div>
</template>

<style scoped>
.tab { display: flex; flex-direction: column; gap: var(--gap-card); }
.tiles { display: grid; grid-template-columns: repeat(auto-fit, minmax(140px, 1fr)); gap: var(--gap-button); }
.pair { display: grid; grid-template-columns: repeat(auto-fit, minmax(280px, 1fr)); gap: var(--gap-card); }
.card-heading { font: var(--font-title-h6); color: var(--text-body); }
</style>
```

Check that `kt-chart` accepts `null` in `values` (a gap in a line). If it does not, map `null` to `undefined` or drop the point, per `node_modules/kanto-ds/dist/components/data/kt-chart/model.d.ts`. If `kt-table` needs row ids, add `id: itemId` (`HardItem.itemId` → pass `s.hardest.map((h) => ({ ...h, id: h.itemId }))`).

- [ ] **Step 2: `StatsWriting.vue`**

```vue
<script setup lang="ts">
import type { KtTableColumn, KtTableRow } from 'kanto-ds';
import { html } from 'lit';
import type { CharacterStrokes } from '~core/chinese/strokes';
import { type FilteredSnapshot, type MissedCharacter, type StatsWindow, rate, writingSummary } from '~core/stats';
import { useStrokeData } from '~/composables/useStrokeData';
import { formatPercent, shortDate } from '~/utils/format';

const props = defineProps<{ data: FilteredSnapshot; window: StatsWindow; now: number }>();
const s = computed(() => writingSummary(props.data.attempts, props.window, props.now));
const pct = (v: number | null) => (v === null ? null : Math.round(v * 100));

const ERROR_LABELS = { 'stroke-count': 'Stroke count', 'stroke-shape': 'Stroke shape', 'stroke-order': 'Stroke order', 'stroke-direction': 'Stroke direction' } as const;

const columns: KtTableColumn[] = [
  { key: 'character', label: 'Character' },
  { key: 'attempts', label: 'Drawn', align: 'right' },
  { key: 'shapeRate', label: 'Right', align: 'right' },
  { key: 'orderRate', label: 'In order', align: 'right' },
  { key: 'lastError', label: 'Last error' },
];

function renderCell(row: KtTableRow, column: KtTableColumn): unknown {
  const r = row as unknown as MissedCharacter;
  if (column.key === 'character') return html`<span style="font-family: var(--fk-font-hanzi)">${r.character}</span>`;
  if (column.key === 'shapeRate') return formatPercent(r.shapeRate);
  if (column.key === 'orderRate') return formatPercent(r.orderRate);
  if (column.key === 'lastError') return r.lastError ? ERROR_LABELS[r.lastError] : '—';
  return undefined;
}

const { load } = useStrokeData();
const open = ref<{ character: string; model: CharacterStrokes } | null>(null);
const panelOpen = ref(false);

async function openCharacter(event: CustomEvent<{ row: MissedCharacter }>): Promise<void> {
  const character = event.detail.row.character;
  const model = await load(character);
  if (!model) return;
  open.value = { character, model };
  panelOpen.value = true;
}
</script>

<template>
  <kt-empty-state v-if="s.checked.total === 0" icon="pen-line" heading="No writing yet" description="Draw a few characters in Writing to see how you write them.">
    <kt-button slot="actions" variant="primary" size="medium" icon="play" @click="navigateTo('/writing')">Start writing</kt-button>
  </kt-empty-state>

  <div v-else class="tab">
    <div class="tiles">
      <kt-stat label="Characters right" :value="formatPercent(rate(s.character))" :caption="`${s.character.total} drawn`" />
      <kt-stat label="In stroke order" :value="formatPercent(rate(s.order))" :caption="`of ${s.order.total} right`" />
      <kt-stat label="Checked by the app" :value="formatPercent(rate(s.checked))" :caption="`${s.checked.total} answers`" />
    </div>

    <kt-card v-if="s.series.length">
      <div slot="header" class="card-heading">Accuracy, %</div>
      <kt-chart
        type="line"
        label="Writing accuracy"
        height="220"
        :labels="s.series.map((p) => shortDate(p.key))"
        :series="[
          { name: 'Character', values: s.series.map((p) => pct(p.character)) },
          { name: 'Stroke order', values: s.series.map((p) => pct(p.order)) },
        ]"
      />
    </kt-card>

    <kt-card>
      <div slot="header" class="card-heading">Errors</div>
      <kt-chart type="doughnut" label="Errors by kind" height="200" center-label="Errors" :labels="Object.values(ERROR_LABELS)" :series="[{ name: 'Errors', values: Object.keys(ERROR_LABELS).map((k) => s.errors[k as keyof typeof ERROR_LABELS]) }]" />
    </kt-card>

    <kt-card>
      <div slot="header" class="card-heading">Characters to work on</div>
      <kt-table label="Characters to work on" :columns="columns" :data="s.missed.map((m) => ({ ...m, id: m.character }))" :renderCell="renderCell" compact empty-text="No mistakes in this period." @kt-row-click="openCharacter" />
    </kt-card>

    <kt-side-panel :open="panelOpen" eyebrow="Stroke order" :heading="open?.character ?? ''" @kt-close="panelOpen = false">
      <StrokeOrderPanel v-if="open" :entries="[{ character: open.character, model: open.model, highlight: null }]" />
    </kt-side-panel>
  </div>
</template>

<style scoped>
.tab { display: flex; flex-direction: column; gap: var(--gap-card); }
.tiles { display: grid; grid-template-columns: repeat(auto-fit, minmax(160px, 1fr)); gap: var(--gap-button); }
.card-heading { font: var(--font-title-h6); color: var(--text-body); }
</style>
```

Note: the Mode filter set to Review empties this tab (writing attempts are filtered out) — the empty state covers it.

- [ ] **Step 3: `StatsJournal.vue`**

```vue
<script setup lang="ts">
import type { KtTableColumn, KtTableRow } from 'kanto-ds';
import { html } from 'lit';
import { type FilteredSnapshot, type JournalFilter, type JournalRow, type StatsWindow, journalRows } from '~core/stats';
import { formatDuration } from '~/utils/format';

const props = defineProps<{ data: FilteredSnapshot; window: StatsWindow; now: number }>();

const filter = reactive<JournalFilter>({ source: null, result: null });
const rows = computed(() => journalRows(props.data, props.window, props.now, filter));

const sources = [
  { value: 'all', label: 'All' },
  { value: 'scheduled', label: 'Scheduled' },
  { value: 'practice', label: 'Practice' },
];
const results = [
  { value: 'all', label: 'All' },
  { value: 'right', label: 'Right' },
  { value: 'wrong', label: 'Wrong' },
];

const GRADE = { 1: ['Again', 'danger'], 2: ['Hard', 'warning'], 3: ['Good', 'success'], 4: ['Easy', 'info'] } as const;
const when = new Intl.DateTimeFormat('en', { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' });

const columns: KtTableColumn[] = [
  { key: 'at', label: 'When' },
  { key: 'hanzi', label: 'Card' },
  { key: 'deckName', label: 'Deck' },
  { key: 'mode', label: 'Mode' },
  { key: 'grade', label: 'Answer' },
  { key: 'durationMs', label: 'Time', align: 'right' },
  { key: 'verdict', label: 'Writing' },
];

function renderCell(row: KtTableRow, column: KtTableColumn): unknown {
  const r = row as unknown as JournalRow;
  if (column.key === 'at') return when.format(r.at);
  if (column.key === 'hanzi') return html`<span style="font-family: var(--fk-font-hanzi)">${r.hanzi}</span>`;
  if (column.key === 'mode') return `${r.mode === 'writing' ? 'Writing' : 'Review'}${r.source === 'practice' ? ' · practice' : ''}`;
  if (column.key === 'grade') {
    const [label, tone] = GRADE[r.grade];
    return html`<kt-badge variant="tag" tone="${tone}" size="small">${label}</kt-badge>`;
  }
  if (column.key === 'durationMs') return formatDuration(r.durationMs);
  if (column.key === 'verdict') return r.verdict || '—';
  return undefined;
}

function openCard(event: CustomEvent<{ row: JournalRow }>): void {
  void navigateTo(`/cards/${event.detail.row.cardId}`);
}
</script>

<template>
  <div class="tab">
    <div class="filters">
      <kt-segmented-control size="small" label="Source" :options="sources" :value="filter.source ?? 'all'" @kt-change="(e: CustomEvent) => (filter.source = e.detail.value === 'all' ? null : e.detail.value)" />
      <kt-segmented-control size="small" label="Result" :options="results" :value="filter.result ?? 'all'" @kt-change="(e: CustomEvent) => (filter.result = e.detail.value === 'all' ? null : e.detail.value)" />
      <span class="count">{{ rows.length }} answer{{ rows.length === 1 ? '' : 's' }}</span>
    </div>
    <kt-table label="Journal" :columns="columns" :data="rows" :renderCell="renderCell" page-size="25" compact empty-text="No answers match." @kt-row-click="openCard" />
  </div>
</template>

<style scoped>
.tab { display: flex; flex-direction: column; gap: var(--gap-card); }
.filters { display: flex; flex-wrap: wrap; align-items: center; gap: var(--gap-button); }
.count { font: var(--font-normal-small); font-family: var(--font-family-code); color: var(--text-muted); }
</style>
```

At phone width, seven columns will crowd. Follow `CardTable.vue`'s `compact` pattern (`useCompactLayout`): below the breakpoint, show When, Card, Answer and Writing only.

- [ ] **Step 4: Wire them into `stats.vue`**

After `StatsActivity`:

```html
      <StatsMemory v-else-if="tab === 'memory'" :data="filtered" :window="filter.window" :now="now" />
      <StatsWriting v-else-if="tab === 'writing'" :data="filtered" :window="filter.window" :now="now" />
      <StatsJournal v-else :data="filtered" :window="filter.window" :now="now" />
```

- [ ] **Step 5: Run the suite and typecheck**

Run: `npm test && npm run typecheck`
Expected: PASS.

- [ ] **Step 6: Check it in the app**

`npm run dev`, `/stats`. Memory: retention tiles and lines, forecast, intervals, answer mix, hardest cards (click opens the card page). Writing: tiles, accuracy lines, error doughnut, characters to work on (click opens the player in a side panel, which animates). Journal: every answer newest first, practice marked, filters by source and result, paging by 25, click opens the card. Check at 390 px width.

- [ ] **Step 7: Commit**

```bash
git add app/components/stats app/pages/stats.vue
git commit -m "Add Memory, Writing and Journal tabs to Statistics"
```

---

### Task 13: Card history from attempts

**Files:**
- Modify: `app/composables/useBrowse.ts`, `app/components/CardTable.vue`, `app/components/CardDetailPanel.vue`, `core/db/repositories.ts` (remove `reviews.historyForCard` if unused)
- Test: `test/composables/useBrowse.test.ts`

**Interfaces:**
- Consumes: `attempts.forCard` (Task 2), `attemptVerdict` (Task 10).
- Produces: `useBrowse(...).history(cardId): Promise<Attempt[]>`; `CardDetailPanel` prop `historyRows: Attempt[]`.

- [ ] **Step 1: Failing test**

In `test/composables/useBrowse.test.ts`, add (reuse the file's own setup helpers for decks, cards and the browse instance):

```ts
  it('builds a card history from its attempts, practice included', async () => {
    // Arrange with the file's helpers: one deck, one card 'c1' with a production item.
    const item = (await items.get('c1:production'))!;
    await reviews.record({ item, before: item, grade: 3, reviewedAt: NOW, durationMs: 1 });
    await attempts.log({ item, grade: 1, at: NOW + 1, durationMs: 1, detail: { checked: false, writing: null } });
    const history = await browse.history('c1');
    expect(history.map((a) => a.source)).toEqual(['scheduled', 'practice']);
  });
```

Adapt `browse` and the arrangement to how the file already builds a `useBrowse` instance and its fixtures.

- [ ] **Step 2: Run to see it fail**

Run: `npx vitest run test/composables/useBrowse.test.ts`
Expected: FAIL (history returns reviews, which have no `source`).

- [ ] **Step 3: Implement**

`useBrowse.ts`: import `attempts`; `history(cardId: string): Promise<Attempt[]> { return attempts.forCard(cardId); }`.

`CardTable.vue`: `historyRows` becomes `ref<Attempt[]>([])`; update the import.

`CardDetailPanel.vue`: prop `historyRows: Attempt[]`; the timeline item:

```html
          <kt-timeline-item
            v-for="attempt in timeline"
            :key="attempt.id"
            :heading="GRADE_META[attempt.grade].label"
            :time="relativeTime(attempt.at)"
            :variant="GRADE_META[attempt.grade].variant"
          >
            {{ describe(attempt) }}
          </kt-timeline-item>
```

with

```ts
import { attemptVerdict } from '~core/stats';
/** "Writing · practice · Character right · order wrong" — mode, source, and the verdict when drawn. */
function describe(a: Attempt): string {
  return [a.mode === 'writing' ? 'Writing' : 'Review', a.source === 'practice' ? 'practice' : '', attemptVerdict(a)].filter(Boolean).join(' · ');
}
```

Rename the section label to "History" and the empty copy to "No answers yet." / "Couldn't load the history.". Update the comment above `timeline` (`attempts.forCard` returns oldest first).

`core/db/repositories.ts`: if `grep -rn historyForCard app core test` shows no other use, delete `reviews.historyForCard` and its tests.

- [ ] **Step 4: Run the suite and typecheck**

Run: `npm test && npm run typecheck`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add app/composables/useBrowse.ts app/components/CardTable.vue app/components/CardDetailPanel.vue core/db/repositories.ts test
git commit -m "Build a card's history from its attempts, practice and writing verdicts included"
```

---

### Task 14: Final pass

**Files:**
- Modify: `docs/superpowers/specs/2026-09-29-writing-verdicts-and-stats-design.md` (status line), `docs/deferred-minors.md` (if anything was parked)

- [ ] **Step 1: Full verification**

Run: `npm test && npm run typecheck && npm run build`
Expected: all pass, build succeeds.

- [ ] **Step 2: End-to-end check in the app**

`npm run dev`. Walk through: a scheduled Writing session with one right drawing, one out of order, one wrong shape; undo the last; an endless practice round; then `/stats` on each tab and filter; then Browse → the card's panel history. Confirm the undone answer is absent everywhere.

- [ ] **Step 3: Mark the spec implemented and commit**

Change the spec's status line to `**Status:** approved; implemented`.

```bash
git add docs
git commit -m "Mark the writing verdicts and statistics spec implemented"
```
