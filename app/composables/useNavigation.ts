import type { KtNavSection } from 'kanto';

/**
 * Kanto's sidebar sections. Each screen is added here by the task that
 * creates it — never before the page exists, so the sidebar never offers a
 * dead link.
 */
export function useNavigation(dueTotal: Readonly<Ref<number>>) {
  const sections = computed<KtNavSection[]>(() => [
    {
      title: 'Learn',
      items: [
        { label: 'Today', href: '/', icon: 'house', badge: dueTotal.value > 0 ? String(dueTotal.value) : undefined },
        { label: 'Review', href: '/review', icon: 'play' },
        { label: 'Writing', href: '/writing', icon: 'pen-line' },
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
  ]);

  return { sections };
}
