import type { KtNavItem, KtNavSection } from 'kanto-ds';
import type { SessionMode } from '~core/db/session';
import type { ModeCounts } from '~/composables/useDueCounts';

/** The Settings sections, in menu order: the settings menu, its mobile list and the command palette all read this. */
export const SETTINGS_SECTIONS: KtNavItem[] = [
  { label: 'Account', href: '/settings/account', icon: 'user' },
  { label: 'Study', href: '/settings/study', icon: 'graduation-cap' },
  { label: 'Display', href: '/settings/display', icon: 'palette' },
  { label: 'Reminders', href: '/settings/reminders', icon: 'bell' },
  { label: 'Data', href: '/settings/data', icon: 'database' },
  { label: 'About', href: '/settings/about', icon: 'info' },
];

/**
 * `kt-sub-menu-navigation` matches `activeHref` by exact equality, so a page
 * below a menu entry maps back to that entry: `/decks/:id` to Decks, every
 * Settings section to Settings.
 */
export function navActiveHref(path: string): string {
  if (path.startsWith('/decks/')) return '/decks';
  if (path.startsWith('/settings/')) return '/settings';
  return path;
}

/**
 * Kanto's sidebar sections. Each screen is added here by the task that
 * creates it — never before the page exists, so the sidebar never offers a
 * dead link.
 */
export function useNavigation(counts: Readonly<Ref<Readonly<Record<SessionMode, ModeCounts>>>>) {
  const badge = (n: number) => (n > 0 ? String(n) : undefined);

  const sections = computed<KtNavSection[]>(() => [
    {
      title: 'Learn',
      items: [
        { label: 'Today', href: '/', icon: 'house' },
        { label: 'Review', href: '/review', icon: 'play', badge: badge(counts.value.review.total) },
        { label: 'Writing', href: '/writing', icon: 'pen-line', badge: badge(counts.value.writing.total) },
        { label: 'Practice', href: '/practice', icon: 'infinity' },
      ],
    },
    {
      title: 'Collection',
      items: [
        { label: 'Decks', href: '/decks', icon: 'layers' },
        { label: 'Cards', href: '/browse', icon: 'list' },
        { label: 'Add', href: '/cards/new', icon: 'plus' },
        { label: 'Import', href: '/import', icon: 'upload' },
      ],
    },
    {
      title: 'App',
      items: [
        { label: 'Statistics', href: '/stats', icon: 'chart-line' },
        { label: 'Settings', href: '/settings', icon: 'settings' },
      ],
    },
    // `/install` only exists under `npm run dev` (`modules/dev-install.ts`
    // adds the route, and it dead-code-eliminates out of every other build)
    // — so this whole section must too, or the link would 404 in prod.
    ...(import.meta.dev ? [{ title: 'Development', items: [{ label: 'Install on a phone', href: '/install', icon: 'smartphone' }] }] : []),
  ]);

  return { sections };
}
