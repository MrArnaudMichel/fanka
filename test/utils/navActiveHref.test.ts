import { describe, expect, it } from 'vitest';
import { navActiveHref } from '~/composables/useNavigation';

describe('navActiveHref', () => {
  it('maps a deck detail page to Decks', () => {
    expect(navActiveHref('/decks/abc')).toBe('/decks');
  });
  it('maps every settings section to Settings', () => {
    expect(navActiveHref('/settings/account')).toBe('/settings');
    expect(navActiveHref('/settings')).toBe('/settings');
  });
  it('leaves other paths alone', () => {
    expect(navActiveHref('/review')).toBe('/review');
  });
});
