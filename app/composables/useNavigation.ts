import type { KtNavSection } from 'kanto';

/**
 * Kanto's sidebar sections for phase 1. Phase 2 screens are added to the
 * Collection section by the task that creates each screen — never before
 * the page exists, so the sidebar never offers a dead link.
 */
export function useNavigation(dueTotal: Readonly<Ref<number>>) {
  const sections = computed<KtNavSection[]>(() => [
    {
      title: 'Learn',
      items: [
        { label: 'Today', href: '/', icon: 'house', badge: dueTotal.value > 0 ? String(dueTotal.value) : undefined },
        { label: 'Review', href: '/review', icon: 'play' },
      ],
    },
    {
      title: 'Collection',
      items: [
        { label: 'Decks', href: '/decks', icon: 'layers' },
        { label: 'Add', href: '/cards/new', icon: 'plus' },
      ],
    },
  ]);

  return { sections };
}
