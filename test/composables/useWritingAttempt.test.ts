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

  it('falls back when a character has no stroke data', async () => {
    const attempt = useWritingAttempt(load);
    await attempt.start('一口');
    expect(attempt.status.value).toBe('unsupported');
    expect(attempt.missing.value).toEqual(['口']);
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
});
