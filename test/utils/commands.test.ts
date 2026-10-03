import { describe, expect, it } from 'vitest';
import type { KtNavSection } from 'kanto-ds';
import { buildCommands } from '~/utils/commands';
import { SETTINGS_SECTIONS } from '~/composables/useNavigation';

const sections: KtNavSection[] = [
  { title: 'Learn', items: [{ label: 'Today', href: '/', icon: 'house' }, { label: 'Review', href: '/review', icon: 'play', badge: '3' }] },
];

describe('buildCommands', () => {
  it('lists every page under Go to, keeping its icon and dropping the badge', () => {
    const commands = buildCommands({ sections, settings: [], signedIn: false, dark: true });
    expect(commands.slice(0, 2)).toEqual([
      { id: 'go:/', label: 'Today', group: 'Go to', icon: 'house', keywords: ['Learn'] },
      { id: 'go:/review', label: 'Review', group: 'Go to', icon: 'play', keywords: ['Learn'] },
    ]);
  });

  it('lists every settings section under Settings', () => {
    const commands = buildCommands({ sections: [], settings: SETTINGS_SECTIONS, signedIn: false, dark: true });
    expect(commands.filter((c) => c.group === 'Settings').map((c) => c.id)).toEqual(SETTINGS_SECTIONS.map((s) => `go:${s.href}`));
  });

  it('offers Sync now only when signed in', () => {
    const out = buildCommands({ sections: [], settings: [], signedIn: false, dark: true });
    const inn = buildCommands({ sections: [], settings: [], signedIn: true, dark: true });
    expect(out.some((c) => c.id === 'action:sync')).toBe(false);
    expect(inn.some((c) => c.id === 'action:sync')).toBe(true);
  });

  it('names the theme switch after the theme it switches to', () => {
    expect(buildCommands({ sections: [], settings: [], signedIn: false, dark: true }).find((c) => c.id === 'action:theme')?.label).toBe('Switch to light theme');
    expect(buildCommands({ sections: [], settings: [], signedIn: false, dark: false }).find((c) => c.id === 'action:theme')?.label).toBe('Switch to dark theme');
  });
});
