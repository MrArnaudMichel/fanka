import { describe, expect, it } from 'vitest';
import type { StrokeCheck } from '~core/chinese/strokes';
import { characterVerdict, highlightFor, orderVerdict } from '~/utils/writingVerdict';

const ok = (n: number): StrokeCheck => ({ shapeCorrect: true, orderCorrect: true, error: null, strokeIndex: null, expected: n, drawn: n, match: [], reversed: [] });
const fault = (over: Partial<StrokeCheck>): StrokeCheck => ({ ...ok(8), shapeCorrect: true, orderCorrect: false, ...over });

// kt-alert has no `eyebrow` prop (checked in kt-alert.d.ts), so the label
// that would have gone there is baked into the heading itself.
describe('characterVerdict', () => {
  it('is right when every shape is right, order aside', () => {
    expect(characterVerdict([{ character: '十', check: fault({ error: 'stroke-order', strokeIndex: 0 }) }])).toEqual({ heading: 'Character: Right', variant: 'success' });
  });

  it('gives the stroke count, capitalised when alone', () => {
    const check = fault({ shapeCorrect: false, error: 'stroke-count', drawn: 7 });
    expect(characterVerdict([{ character: '學', check }]).heading).toBe('Character: Wrong stroke count, 7 of 8');
  });

  it('names the character in a word', () => {
    const check = fault({ shapeCorrect: false, error: 'stroke-shape', strokeIndex: 2 });
    expect(characterVerdict([{ character: '學', check: ok(8) }, { character: '習', check }])).toEqual({ heading: "Character: 習: stroke 3 doesn't match", variant: 'danger' });
  });
});

describe('orderVerdict', () => {
  it('is right when every order is right', () => {
    expect(orderVerdict([{ character: '十', check: ok(2) }])).toEqual({ heading: 'Stroke order: Right', variant: 'success' });
  });

  it('names a stroke out of order', () => {
    expect(orderVerdict([{ character: '十', check: fault({ error: 'stroke-order', strokeIndex: 0 }) }])).toEqual({ heading: 'Stroke order: Stroke 1 drawn out of order', variant: 'warning' });
  });

  it('names a stroke drawn backwards', () => {
    expect(orderVerdict([{ character: '永', check: fault({ error: 'stroke-direction', strokeIndex: 1 }) }]).heading).toBe('Stroke order: Stroke 2 drawn backwards');
  });

  it('reports an order fault in one character even when another has a shape fault', () => {
    const shape = fault({ shapeCorrect: false, error: 'stroke-shape', strokeIndex: 0 });
    const order = fault({ error: 'stroke-order', strokeIndex: 3 });
    expect(orderVerdict([{ character: '學', check: shape }, { character: '習', check: order }]).heading).toBe('Stroke order: 習: stroke 4 drawn out of order');
    expect(characterVerdict([{ character: '學', check: shape }, { character: '習', check: order }]).variant).toBe('danger');
  });

  it('is not checked when the only faults are shape faults', () => {
    const shape = fault({ shapeCorrect: false, error: 'stroke-count' });
    expect(orderVerdict([{ character: '學', check: shape }])).toEqual({ heading: 'Stroke order: Not checked', variant: 'info' });
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
