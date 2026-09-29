import { describe, expect, it } from 'vitest';
import { type CharacterStrokes, type Point, checkCharacter, strokeOrderFrames, toModelSpace } from '~core/chinese/strokes';
import 一 from '../fixtures/strokes/一.json';
import 十 from '../fixtures/strokes/十.json';
import 口 from '../fixtures/strokes/口.json';
import 學 from '../fixtures/strokes/學.json';
import 永 from '../fixtures/strokes/永.json';
import 習 from '../fixtures/strokes/習.json';

// JSON imports type medians as `number[][][]`; the files hold `[x, y]` pairs.
const MODELS = { 一, 十, 口, 學, 永, 習 } as unknown as Record<string, CharacterStrokes>;

/** A learner who traces the model exactly: its medians, densified. */
function traced(model: CharacterStrokes): Point[][] {
  return model.medians.map((median) => densify(median.map(([x, y]) => ({ x, y }))));
}

/** Pointer events arrive every few pixels, not only at the median's corners. */
function densify(points: Point[]): Point[] {
  const out: Point[] = [];
  for (let i = 0; i < points.length - 1; i += 1) {
    const a = points[i]!;
    const b = points[i + 1]!;
    for (let t = 0; t < 8; t += 1) out.push({ x: a.x + ((b.x - a.x) * t) / 8, y: a.y + ((b.y - a.y) * t) / 8 });
  }
  out.push(points.at(-1)!);
  return out;
}

/** Deterministic wobble, so a failure reproduces. */
function jitter(strokes: Point[][], amount: number): Point[][] {
  let seed = 7;
  const next = () => {
    seed = (seed * 16807) % 2147483647;
    return (seed / 2147483647) * 2 - 1;
  };
  return strokes.map((stroke) => stroke.map((p) => ({ x: p.x + next() * amount, y: p.y + next() * amount })));
}

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

describe('toModelSpace', () => {
  it('maps the pad onto the model box, flipping y around the baseline', () => {
    const corners = toModelSpace(
      [
        { x: 0, y: 0 },
        { x: 300, y: 300 },
      ],
      300,
    );
    expect(corners).toEqual([
      { x: 0, y: 900 },
      { x: 1024, y: -124 },
    ]);
  });
});
