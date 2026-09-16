import { describe, expect, it } from 'vitest';
import { TONE_COLOR_TOKENS, toneColorToken } from '~core/chinese/tones';

describe('toneColorToken', () => {
  it('maps each tone to the semantic token the design specifies', () => {
    expect(toneColorToken(1)).toBe('var(--color-info-base)');
    expect(toneColorToken(2)).toBe('var(--color-success-base)');
    expect(toneColorToken(3)).toBe('var(--color-warning-base)');
    expect(toneColorToken(4)).toBe('var(--color-danger-base)');
    expect(toneColorToken(5)).toBe('var(--color-text-400)');
  });

  it('only ever returns Kanto tokens, never literal colours', () => {
    for (const value of Object.values(TONE_COLOR_TOKENS)) {
      expect(value).toMatch(/^var\(--[a-z0-9-]+\)$/);
    }
  });
});
