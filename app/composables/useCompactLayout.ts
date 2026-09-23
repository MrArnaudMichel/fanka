/**
 * Whether the viewport is below the shell's 900px breakpoint — where
 * `kt-header` replaces the sidebar. For layout that CSS alone cannot switch,
 * such as which columns `kt-table` gets. One media query listener for the
 * whole app, shared by every caller.
 */
const compact = ref(false);
let listening = false;

export function useCompactLayout() {
  if (import.meta.client && !listening) {
    listening = true;
    const query = window.matchMedia('(max-width: 899px)');
    compact.value = query.matches;
    query.addEventListener('change', (event) => {
      compact.value = event.matches;
    });
  }
  return { compact: readonly(compact) };
}
