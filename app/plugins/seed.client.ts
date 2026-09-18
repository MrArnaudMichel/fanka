import { seedIfNeeded } from '~core/seed/seed';
import { useSeedStatus } from '~/composables/useSeedStatus';

/**
 * Runs before the first paint on the client. Nuxt awaits every non-parallel
 * plugin — this one included — before `vueApp.mount()`, so `index.vue`'s own
 * `onMounted` never races a first-launch seed: by the time any page's
 * `onMounted` runs, seeding has already settled, successfully or not.
 *
 * Seeding is idempotent, so this costs one settings read on every
 * subsequent launch.
 */
export default defineNuxtPlugin(async () => {
  try {
    await seedIfNeeded(Date.now());
  } catch (err) {
    // A failed seed must not block the app from mounting — the page still
    // renders (with an empty deck list) rather than leaving a blank screen.
    // `markFailed` lets the Today page tell this apart from a fresh,
    // legitimately-empty database and offer a retry instead of "reload".
    console.error('seed.client: seedIfNeeded failed', err);
    useSeedStatus().markFailed();
  }
});
