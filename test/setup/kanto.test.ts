import { describe, expect, it } from 'vitest';
import { isKantoElement } from 'kanto/vue';

describe('Kanto wiring', () => {
  it('recognises kt- tags as custom elements', () => {
    expect(isKantoElement('kt-button')).toBe(true);
    expect(isKantoElement('kt-card')).toBe(true);
  });

  it('does not claim ordinary tags', () => {
    expect(isKantoElement('div')).toBe(false);
    expect(isKantoElement('button')).toBe(false);
  });

  it('defines the elements when the vue entry is imported', async () => {
    await import('kanto/vue');
    expect(customElements.get('kt-button')).toBeTypeOf('function');
    expect(customElements.get('kt-card')).toBeTypeOf('function');
  });
});
