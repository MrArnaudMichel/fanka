import type { KtCommand, KtNavItem, KtNavSection } from 'kanto-ds';

export interface CommandInput {
  sections: KtNavSection[];
  settings: KtNavItem[];
  signedIn: boolean;
  /** Whether the current theme renders dark, so the switch names the other one. */
  dark: boolean;
}

function goTo(item: KtNavItem, group: string, keywords: string[]): KtCommand | null {
  if (!item.href) return null;
  return { id: `go:${item.href}`, label: item.label, group, ...(item.icon ? { icon: item.icon } : {}), keywords };
}

/** Everything the command palette offers. Pure, so it is tested without Nuxt. */
export function buildCommands({ sections, settings, signedIn, dark }: CommandInput): KtCommand[] {
  const pages = sections.flatMap((section) =>
    section.items.map((item) => goTo(item, 'Go to', section.title ? [section.title] : [])),
  );
  const settingsPages = settings.map((item) => goTo(item, 'Settings', ['settings', 'preferences']));
  const actions: KtCommand[] = [
    ...(signedIn ? [{ id: 'action:sync', label: 'Sync now', group: 'Actions', icon: 'refresh-cw' }] : []),
    { id: 'action:theme', label: dark ? 'Switch to light theme' : 'Switch to dark theme', group: 'Actions', icon: 'sun-moon', keywords: ['theme', 'dark', 'light'] },
  ];
  return [...pages, ...settingsPages].filter((c): c is KtCommand => c !== null).concat(actions);
}
