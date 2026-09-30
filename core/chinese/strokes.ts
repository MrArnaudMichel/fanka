/**
 * Checks a hand-drawn character against the Make Me a Hanzi stroke data
 * (`public/strokes/<character>.json`, built by `scripts/build-stroke-data.mjs`).
 *
 * The data describes each stroke by its median: the line through its middle,
 * in the order and direction it is written. A drawing's *shape* is right
 * when it has the same number of strokes and every drawn stroke follows a
 * distinct median, in either direction. Its *order* is right when stroke
 * *i* follows median *i*, forwards.
 *
 * The per-stroke test follows the approach of Hanzi Writer's quiz (MIT), and
 * starts from its thresholds; the tests in `test/chinese/strokes.test.ts`
 * hold them against real medians.
 */

export interface Point {
  x: number;
  y: number;
}

/** One character's entry in the stroke data. Medians are `[x, y]` pairs. */
export interface CharacterStrokes {
  /** SVG path per stroke, in model space — used only to draw the model. */
  strokes: string[];
  medians: [number, number][][];
}

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

/** Side of the model box. */
export const MODEL_SIZE = 1024;
/** The model's y axis points up from this baseline. */
export const MODEL_BASELINE = 900;

/** Furthest a stroke's start or its end may sit from the median's. */
export const START_END_MAX = 250;
/** Largest mean distance between the resampled stroke and median. */
export const AVG_DIST_MAX = 350;
/** Smallest cosine between the two overall directions. */
export const DIRECTION_MIN = 0;
/** Shortest a stroke may be, as a share of its median's length. */
export const LENGTH_MIN_RATIO = 0.35;

/**
 * Below this fraction of the identity assignment's total cost, the greedy
 * assignment wins even when the identity assignment (stroke i follows
 * median i) is itself valid. Two strokes drawn close together and swapped
 * can each fit the other's median within the per-stroke thresholds, so a
 * valid identity assignment is not always the intended one; a greedy
 * assignment this much cheaper is. Keeps a shaky but correctly ordered
 * drawing's verdict, since jitter raises both assignments' cost together.
 */
export const GREEDY_COST_RATIO = 0.7;

const RESAMPLE_POINTS = 32;

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

/**
 * Whether one drawn stroke (model space) follows median `index`, in either
 * direction — the per-stroke test `checkCharacter` uses, for checking a
 * character one stroke at a time. `reversed` when it follows it backwards.
 */
export function checkStroke(stroke: Point[], model: CharacterStrokes, index: number): { matches: boolean; reversed: boolean } {
  const median = model.medians[index];
  if (!median) return { matches: false, reversed: false };
  const f = fit(
    stroke,
    median.map(([x, y]) => ({ x, y })),
  );
  return f ? { matches: true, reversed: f.reversed } : { matches: false, reversed: false };
}

export function checkCharacter(drawn: Point[][], model: CharacterStrokes): StrokeCheck {
  const expected = model.medians.length;
  const medians = model.medians.map((median) => median.map(([x, y]) => ({ x, y })));
  const match: (number | null)[] = drawn.map(() => null);
  const reversed: boolean[] = drawn.map(() => false);

  // Identity: stroke i follows median i. Computed alongside the greedy
  // assignment below, never taken as a shortcut — two strokes drawn close
  // together and swapped can each fit the other's median within the
  // per-stroke thresholds, so a valid identity assignment is not proof it's
  // the intended one.
  const identity = drawn.length === expected ? drawn.map((stroke, i) => fit(stroke, medians[i]!)) : [];
  const identityValid = drawn.length === expected && identity.every((f): f is Fit => f !== null);

  // Greedy assignment, cheapest pair first; on equal cost, the pair closer
  // to its expected position wins. At most ~30 strokes, so the n² pairs are
  // cheap and an optimal assignment is not worth it.
  const pairs: { i: number; j: number; cost: number; reversed: boolean }[] = [];
  drawn.forEach((stroke, i) =>
    medians.forEach((median, j) => {
      const f = fit(stroke, median);
      if (f) pairs.push({ i, j, cost: f.cost, reversed: f.reversed });
    }),
  );
  pairs.sort((a, b) => a.cost - b.cost || Math.abs(a.i - a.j) - Math.abs(b.i - b.j));
  const greedyMatch: (number | null)[] = drawn.map(() => null);
  const greedyReversed: boolean[] = drawn.map(() => false);
  const greedyCosts: number[] = drawn.map(() => 0);
  const usedMedians = new Set<number>();
  for (const p of pairs) {
    if (greedyMatch[p.i] !== null || usedMedians.has(p.j)) continue;
    greedyMatch[p.i] = p.j;
    greedyReversed[p.i] = p.reversed;
    greedyCosts[p.i] = p.cost;
    usedMedians.add(p.j);
  }
  const greedyComplete = greedyMatch.every((j) => j !== null);
  const greedyTotalCost = greedyCosts.reduce((sum, c) => sum + c, 0);
  const identityTotalCost = identityValid ? identity.reduce((sum, f) => sum + f!.cost, 0) : 0;
  const greedyClearlyCheaper = greedyComplete && identityValid && greedyTotalCost < identityTotalCost * GREEDY_COST_RATIO;

  if (identityValid && !greedyClearlyCheaper) {
    identity.forEach((f, i) => {
      match[i] = i;
      reversed[i] = f!.reversed;
    });
  } else {
    greedyMatch.forEach((j, i) => {
      match[i] = j;
      reversed[i] = greedyReversed[i]!;
    });
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

/**
 * Pad coordinates (origin top-left, y down, `padSize` wide) to model space
 * (1024 wide, y up from a baseline at 900).
 */
export function toModelSpace(points: Point[], padSize: number): Point[] {
  const scale = MODEL_SIZE / padSize;
  return points.map((p) => ({ x: p.x * scale, y: MODEL_BASELINE - p.y * scale }));
}

/** Model space back to a y-down box of `MODEL_SIZE` — for drawing an overlay. */
export function toPadSpace(points: Point[]): Point[] {
  return points.map((p) => ({ x: p.x, y: MODEL_BASELINE - p.y }));
}

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

function distance(a: Point, b: Point): number {
  return Math.hypot(a.x - b.x, a.y - b.y);
}

function length(points: Point[]): number {
  let total = 0;
  for (let i = 1; i < points.length; i += 1) total += distance(points[i - 1]!, points[i]!);
  return total;
}

function direction(points: Point[]): Point {
  const start = points[0]!;
  const end = points.at(-1)!;
  return { x: end.x - start.x, y: end.y - start.y };
}

function cosine(a: Point, b: Point): number {
  const norms = Math.hypot(a.x, a.y) * Math.hypot(b.x, b.y);
  // A zero-length direction (a dot, or a closed loop) has no direction to
  // disagree with; the length and shape checks decide it instead.
  return norms === 0 ? 1 : (a.x * b.x + a.y * b.y) / norms;
}

/** `count` points evenly spaced along the polyline, ends included. */
function resample(points: Point[], count: number): Point[] {
  const total = length(points);
  if (points.length === 1 || total === 0) return Array.from({ length: count }, () => ({ ...points[0]! }));

  const step = total / (count - 1);
  const out: Point[] = [{ ...points[0]! }];
  let segment = 1;
  let walked = 0;
  for (let k = 1; k < count - 1; k += 1) {
    const target = k * step;
    while (segment < points.length - 1 && walked + distance(points[segment - 1]!, points[segment]!) < target) {
      walked += distance(points[segment - 1]!, points[segment]!);
      segment += 1;
    }
    const a = points[segment - 1]!;
    const b = points[segment]!;
    const span = distance(a, b);
    const t = span === 0 ? 0 : (target - walked) / span;
    out.push({ x: a.x + (b.x - a.x) * t, y: a.y + (b.y - a.y) * t });
  }
  out.push({ ...points.at(-1)! });
  return out;
}

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
