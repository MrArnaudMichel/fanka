import { describe, expect, it } from 'vitest';
import type { CharacterStrokes, Point } from '~core/chinese/strokes';
import { useWritingAttempt } from '~/composables/useWritingAttempt';
import 一 from '../fixtures/strokes/一.json';
import 十 from '../fixtures/strokes/十.json';

const DATA = { 一, 十 } as unknown as Record<string, CharacterStrokes>;
const load = async (c: string) => DATA[c] ?? null;

/** The model's medians, turned back into what the pad would have emitted. */
function drawn(model: CharacterStrokes): Point[][] {
  return model.medians.map((median) => median.map(([x, y]) => ({ x, y: 900 - y })));
}

describe('useWritingAttempt', () => {
  it('checks each character in turn, then gives a verdict for the word', async () => {
    const attempt = useWritingAttempt(load);
    await attempt.start('十一');
    expect(attempt.status.value).toBe('drawing');

    attempt.submit(drawn(DATA.十!));
    expect(attempt.position.value).toBe(1);
    expect(attempt.status.value).toBe('drawing');

    attempt.submit(drawn(DATA.一!));
    expect(attempt.status.value).toBe('checked');
    expect(attempt.correct.value).toBe(true);
    expect(attempt.firstWrong.value).toBeNull();
  });

  it('marks the word wrong when any character is wrong', async () => {
    const attempt = useWritingAttempt(load);
    await attempt.start('十一');
    attempt.submit(drawn(DATA.一!));
    attempt.submit(drawn(DATA.一!));
    expect(attempt.correct.value).toBe(false);
    expect(attempt.firstWrong.value?.character).toBe('十');
  });

  it('counts a character with its strokes out of order as right', async () => {
    const attempt = useWritingAttempt(load);
    await attempt.start('十');
    const [a, b] = drawn(DATA.十!);
    attempt.submit([b!, a!]);
    expect(attempt.correct.value).toBe(true);
  });

  it('falls back when a character has no stroke data', async () => {
    const attempt = useWritingAttempt(load);
    await attempt.start('一口');
    expect(attempt.status.value).toBe('unsupported');
    expect(attempt.missing.value).toEqual(['口']);
  });

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

  it('ignores a slow load for a card it has already moved past', async () => {
    let release!: () => void;
    const gate = new Promise<void>((resolve) => (release = resolve));
    const slow = async (c: string) => {
      if (c === '十') await gate;
      return DATA[c] ?? null;
    };
    const attempt = useWritingAttempt(slow);
    const first = attempt.start('十');
    await attempt.start('一');
    release();
    await first;
    expect(attempt.characters.value).toEqual(['一']);
    expect(attempt.status.value).toBe('drawing');
  });

  describe('live mode', () => {
    const live = () => useWritingAttempt(load, { live: true });
    /** Far from every stroke of 十 and 一. */
    const scribble: Point[] = [
      { x: 60, y: 60 },
      { x: 90, y: 70 },
      { x: 120, y: 60 },
    ];

    it('keeps a stroke that follows the next expected one', async () => {
      const attempt = live();
      await attempt.start('十');
      const [first] = drawn(DATA.十!);
      expect(attempt.addStroke(first!)).toBe('accepted');
      expect(attempt.strokes.value).toHaveLength(1);
      expect(attempt.status.value).toBe('drawing');
      expect(attempt.lastRejected.value).toBe(0);
    });

    it('refuses a wrong stroke without keeping it', async () => {
      const attempt = live();
      await attempt.start('十');
      expect(attempt.addStroke(scribble)).toBe('rejected');
      expect(attempt.strokes.value).toHaveLength(0);
      expect(attempt.lastRejected.value).toBe(1);
      expect(attempt.hint.value).toBeNull();
    });

    it('shows the expected stroke after three refusals in a row, until it is drawn', async () => {
      const attempt = live();
      await attempt.start('十');
      attempt.addStroke(scribble);
      attempt.addStroke(scribble);
      expect(attempt.hint.value).toBeNull();
      attempt.addStroke(scribble);
      expect(attempt.hint.value).toBe(0);
      expect(attempt.hintsUsed.value).toBe(true);
      attempt.addStroke(drawn(DATA.十!)[0]!);
      expect(attempt.hint.value).toBeNull();
      expect(attempt.hintsUsed.value).toBe(true);
    });

    it('faults the order when a later stroke is drawn ahead of its turn', async () => {
      const attempt = live();
      await attempt.start('十');
      const [a, b] = drawn(DATA.十!);
      expect(attempt.addStroke(b!)).toBe('rejected');
      attempt.addStroke(a!);
      attempt.addStroke(b!);
      expect(attempt.status.value).toBe('checked');
      expect(attempt.correct.value).toBe(true);
      expect(attempt.results.value).toEqual([
        { character: '十', shapeCorrect: true, orderCorrect: false, error: 'stroke-order', strokeIndex: 0, expected: 2, drawn: 2 },
      ]);
    });

    it('keeps a stroke drawn backwards, and faults its direction', async () => {
      const attempt = live();
      await attempt.start('十');
      const [a, b] = drawn(DATA.十!);
      expect(attempt.addStroke([...a!].reverse())).toBe('accepted');
      attempt.addStroke(b!);
      expect(attempt.results.value).toEqual([
        { character: '十', shapeCorrect: true, orderCorrect: false, error: 'stroke-direction', strokeIndex: 0, expected: 2, drawn: 2 },
      ]);
    });

    it('moves through every character to the verdict', async () => {
      const attempt = live();
      await attempt.start('十一');
      const [a, b] = drawn(DATA.十!);
      attempt.addStroke(a!);
      attempt.addStroke(b!);
      expect(attempt.position.value).toBe(1);
      expect(attempt.strokes.value).toHaveLength(0);
      expect(attempt.status.value).toBe('drawing');
      attempt.addStroke(drawn(DATA.一!)[0]!);
      expect(attempt.status.value).toBe('checked');
      expect(attempt.correct.value).toBe(true);
      expect(attempt.hintsUsed.value).toBe(false);
      expect(attempt.results.value.map((r) => r.orderCorrect)).toEqual([true, true]);
    });

    it('drops the last kept stroke on undo, and starts the character over on restart', async () => {
      const attempt = live();
      await attempt.start('十');
      const [a] = drawn(DATA.十!);
      attempt.addStroke(a!);
      attempt.undoStroke();
      expect(attempt.strokes.value).toHaveLength(0);
      attempt.addStroke(a!);
      attempt.restartCharacter();
      expect(attempt.strokes.value).toHaveLength(0);
      expect(attempt.addStroke(a!)).toBe('accepted');
    });

    it('leaves the whole-character check alone when off', async () => {
      const attempt = useWritingAttempt(load, { live: false });
      await attempt.start('一');
      expect(attempt.addStroke(drawn(DATA.一!)[0]!)).toBe('ignored');
      attempt.submit(drawn(DATA.一!));
      expect(attempt.status.value).toBe('checked');
    });
  });
});
