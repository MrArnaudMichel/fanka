/**
 * Checks a hand-drawn character against the Make Me a Hanzi stroke data
 * (`public/strokes/<character>.json`, built by `scripts/build-stroke-data.mjs`).
 *
 * The data describes each stroke by its median: the line through its middle,
 * in the order and direction it is written. A drawing is correct when it has
 * the same number of strokes and stroke *i* follows median *i* — so stroke
 * order and direction are enforced by construction, not by a separate rule.
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

export interface StrokeCheck {
  correct: boolean;
  /** Stroke count of the model. */
  expected: number;
  drawn: number;
  /** Index of the first stroke that fails, or `null` when all match. */
  firstMismatch: number | null;
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

const RESAMPLE_POINTS = 32;

export function checkCharacter(drawn: Point[][], model: CharacterStrokes): StrokeCheck {
  const expected = model.medians.length;
  const medians = model.medians.map((median) => median.map(([x, y]) => ({ x, y })));

  let firstMismatch: number | null = null;
  for (let i = 0; i < Math.max(drawn.length, expected); i += 1) {
    const stroke = drawn[i];
    const median = medians[i];
    if (!stroke || !median || !strokeMatches(stroke, median)) {
      firstMismatch = i;
      break;
    }
  }

  return { correct: firstMismatch === null, expected, drawn: drawn.length, firstMismatch };
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

function strokeMatches(stroke: Point[], median: Point[]): boolean {
  if (stroke.length === 0 || median.length === 0) return false;

  const strokeLength = length(stroke);
  const medianLength = length(median);
  if (strokeLength < medianLength * LENGTH_MIN_RATIO) return false;

  if (distance(stroke[0]!, median[0]!) > START_END_MAX) return false;
  if (distance(stroke.at(-1)!, median.at(-1)!) > START_END_MAX) return false;

  if (cosine(direction(stroke), direction(median)) < DIRECTION_MIN) return false;

  const a = resample(stroke, RESAMPLE_POINTS);
  const b = resample(median, RESAMPLE_POINTS);
  const mean = a.reduce((sum, p, i) => sum + distance(p, b[i]!), 0) / RESAMPLE_POINTS;
  return mean <= AVG_DIST_MAX;
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
