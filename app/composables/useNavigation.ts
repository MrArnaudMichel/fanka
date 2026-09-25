import type { KtNavSection } from 'kanto-ds';
import type { SessionMode } from '~core/db/session';
import type { ModeCounts } from '~/composables/useDueCounts';

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
