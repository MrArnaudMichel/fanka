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
