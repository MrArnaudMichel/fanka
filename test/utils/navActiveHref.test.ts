import { describe, expect, it } from 'vitest';
import type { KtNavSection } from 'kanto-ds';
import { SETTINGS_SECTIONS, flatNavItems, navActiveHref } from '~/composables/useNavigation';

describe('navActiveHref', () => {
  it('maps a deck detail page to Decks', () => {
    expect(navActiveHref('/decks/abc')).toBe('/decks');
  });
  it('keeps a settings section as is, so its own entry under Settings is the active one', () => {
    expect(navActiveHref('/settings/account')).toBe('/settings/account');
  });
  it('leaves other paths alone', () => {
    expect(navActiveHref('/review')).toBe('/review');
  });
});

describe('flatNavItems', () => {
  it('lists every linked item, nested ones included', () => {
    const sections: KtNavSection[] = [
      { title: 'App', items: [{ label: 'Statistics', href: '/stats' }, { label: 'Settings', children: SETTINGS_SECTIONS }] },
    ];
    expect(flatNavItems(sections).map((i) => i.href)).toEqual(['/stats', ...SETTINGS_SECTIONS.map((s) => s.href)]);
  });
});
