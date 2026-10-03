import type { RouteLocationRaw } from 'vue-router';

/**
 * Holds a navigation away from a page with unsaved edits until the learner
 * chooses: `stay()` cancels it, `leave()` carries it on. The page shows the
 * choice through `UnsavedChangesDialog`, bound to `asking`.
 */
export function useLeaveGuard(dirty: Readonly<Ref<boolean>>) {
  const asking = ref(false);
  let pending: RouteLocationRaw | null = null;
  let allowed = false;

  onBeforeRouteLeave((to) => {
    if (allowed || !dirty.value) return true;
    pending = to.fullPath;
    asking.value = true;
    return false;
  });

  function stay(): void {
    asking.value = false;
    pending = null;
  }

  async function leave(): Promise<void> {
    asking.value = false;
    if (!pending) return;
    allowed = true;
    await navigateTo(pending);
  }

  return { asking: readonly(asking), stay, leave };
}
