import { settingsLoaded } from '~/composables/useSettings';

/**
 * Applies the stored theme to `<html>` before the app mounts. Nuxt awaits
 * every non-parallel plugin (this one included) before `vueApp.mount()` —
 * same guarantee `seed.client.ts` relies on — so by the time anything paints,
 * `data-theme`/`data-hanzi-font` already match what was saved, instead of
 * showing Kanto's default dark theme for a frame and then flipping to light.
 *
 * `useSettings()`'s own load already calls `applyTheme` once it resolves;
 * this plugin only makes sure that resolution happens before mount rather
 * than whenever the first component to call `useSettings()` happens to
 * render.
 *
 * Caught, not propagated: a rejected initial read (quota, a blocked
 * `versionchange`, the exact fault `e2e/collection.spec.ts`'s Today-load
 * test injects) must not fail *app initialization* — Nuxt awaits every
 * non-parallel plugin before `vueApp.mount()`, so an unhandled rejection
 * here blanks the entire app instead of just leaving the default theme on
 * screen for this one load. Every page that actually needs the settings
 * row (Today, Review, Settings) already has its own Retry path for this
 * same failure; this plugin only owes the theme attribute, which is fine
 * left at Kanto's default dark when the read fails.
 */
export default defineNuxtPlugin(async () => {
  try {
    await settingsLoaded();
  } catch (err) {
    console.error('theme: failed to load the initial theme', err);
  }
});
