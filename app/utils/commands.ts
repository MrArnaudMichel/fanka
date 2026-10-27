import type { KtCommand, KtNavItem, KtNavSection } from 'kanto-ds';

export interface CommandInput {
  sections: KtNavSection[];
  settings: KtNavItem[];
  /** The learner's decks, each a direct jump to its page. */
  decks: { id: string; name: string }[];
  signedIn: boolean;
  /** Whether the current theme renders dark, so the switch names the other one. */
  dark: boolean;
}

function goTo(item: KtNavItem, group: string, keywords: string[]): KtCommand[] {
  if (!item.href) return [];
  return [{ id: `go:${item.href}`, label: item.label, group, ...(item.icon ? { icon: item.icon } : {}), keywords }];
}

/** Everything the command palette offers. Pure, so it is tested without Nuxt. */
export function buildCommands({ sections, settings, decks, signedIn, dark }: CommandInput): KtCommand[] {
  const pages = sections.flatMap((section) => section.items.flatMap((item) => goTo(item, 'Go to', section.title ? [section.title] : [])));
  const settingsPages = settings.flatMap((item) => goTo(item, 'Settings', ['settings', 'preferences']));
  const deckPages: KtCommand[] = decks.map((deck) => ({ id: `go:/decks/${deck.id}`, label: deck.name, group: 'Decks', icon: 'layers', keywords: ['deck'] }));
  const actions: KtCommand[] = [
    { id: 'go:/cards/new', label: 'Add a card', group: 'Actions', icon: 'plus', keywords: ['new', 'card', 'add'] },
    ...(signedIn ? [{ id: 'action:sync', label: 'Sync now', group: 'Actions', icon: 'refresh-cw' }] : []),
    { id: 'action:theme', label: dark ? 'Switch to light theme' : 'Switch to dark theme', group: 'Actions', icon: 'sun-moon', keywords: ['theme', 'dark', 'light'] },
  ];
  return [...pages, ...settingsPages, ...deckPages, ...actions];
}
