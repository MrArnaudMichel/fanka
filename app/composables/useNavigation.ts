export interface NavEntry {
  to: string;
  label: string;
  icon: string;
  badge?: string;
}

/**
 * The routes for phase 1. Entries whose page arrives in a later phase are
 * added when that phase lands, so the sidebar never offers a dead link.
 */
export function useNavigation(dueTotal: Readonly<Ref<number>>) {
  const main = computed<NavEntry[]>(() => [
    { to: '/', label: 'Today', icon: 'house', badge: dueTotal.value > 0 ? String(dueTotal.value) : undefined },
    { to: '/review', label: 'Review', icon: 'play' },
  ]);

  // Settings has no page until phase 3. Nothing lists it until then.
  const library = computed<NavEntry[]>(() => []);

  const bar = computed<NavEntry[]>(() => [
    { to: '/', label: 'Home', icon: 'house' },
    { to: '/review', label: 'Review', icon: 'play' },
  ]);

  return { main, library, bar };
}
