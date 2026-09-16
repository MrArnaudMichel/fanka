import type { Tone } from './pinyin';

/**
 * Tones borrow the semantic palette rather than introducing a sixth scale.
 * Rising is success, falling is danger, and the neutral tone recedes to muted
 * text — which also means the mapping survives a theme change for free.
 */
export const TONE_COLOR_TOKENS: Record<Tone, string> = {
  1: 'var(--color-info-base)',
  2: 'var(--color-success-base)',
  3: 'var(--color-warning-base)',
  4: 'var(--color-danger-base)',
  5: 'var(--color-text-400)',
};

export function toneColorToken(tone: Tone): string {
  return TONE_COLOR_TOKENS[tone] ?? TONE_COLOR_TOKENS[5];
}
