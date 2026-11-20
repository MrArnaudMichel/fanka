import { needsOnboarding } from '~core/db/onboarding';
import { settingsLoaded, useSettings } from '~/composables/useSettings';

/**
 * Sends a learner who has not onboarded to /welcome, from any page but the
 * onboarding and the public legal pages. A settings read that fails lets the
 * navigation through: the page's own Retry handles that, and trapping the
 * learner on /welcome over a read error would be worse.
 */
export default defineNuxtRouteMiddleware(async (to) => {
  try {
    await settingsLoaded();
  } catch {
    return;
  }
  const { settings } = useSettings();
  if (needsOnboarding(settings.value, to.path)) return navigateTo('/welcome', { replace: true });
  if (to.path === '/welcome' && settings.value.onboardedAt !== null) return navigateTo('/', { replace: true });
  // Radicals are Traditional-only for now; the nav hides them, this covers a typed URL.
  if (to.path === '/radicals' && settings.value.bundle === 'mainland') return navigateTo('/', { replace: true });
});
