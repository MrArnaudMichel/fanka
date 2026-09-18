import { useSeedStatus } from '~/composables/useSeedStatus';

/**
 * Runs before the first paint on the client. Nuxt awaits every non-parallel
 * plugin — this one included — before `vueApp.mount()`, so `index.vue`'s own
 * `onMounted` never races a first-launch seed: by the time any page's
 * `onMounted` runs, seeding has already settled, successfully or not.
 *
 * `useSeedStatus().retry` does the actual seeding and marks failure on a
 * rejection — sharing it with the Today page's own Retry button means this
 * first, automatic attempt and any later manual one behave identically. A
 * failed seed must not block the app from mounting: `retry` never rethrows,
 * so the page still renders (with an empty deck list) rather than leaving a
 * blank screen. Seeding is idempotent, so this costs one settings read on
 * every subsequent launch.
 */
export default defineNuxtPlugin(async () => {
  await useSeedStatus().retry();
});
