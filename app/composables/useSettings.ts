import { Capacitor } from '@capacitor/core';
import { Style, StatusBar } from '@capacitor/status-bar';
import { DEFAULT_SETTINGS, type Settings, loadSettings, saveSettings } from '~core/db/settings';

const settings = ref<Settings>({ ...DEFAULT_SETTINGS });
const ready = ref(false);

// Attached once: the Android status bar does not repaint itself when the OS
// theme flips under an `auto` preference the way in-app CSS does (Kanto's
// `[data-theme='auto']` rule is a plain `@media` query, no JS involved) — it
// only ever gets what the last `StatusBar.setStyle()` call told it. Without
// this, a phone that changes theme (e.g. a scheduled dark mode) while Fanka
// sits foregrounded in `auto` leaves the status bar showing the old style
// until the next settings save or app relaunch.
let statusBarAutoListenerAttached = false;
function ensureStatusBarAutoListener(): void {
  if (statusBarAutoListenerAttached || typeof window === 'undefined' || !window.matchMedia) return;
  statusBarAutoListenerAttached = true;
  window.matchMedia('(prefers-color-scheme: dark)').addEventListener('change', () => {
    syncStatusBar(settings.value);
  });
}

// Dedupes the initial load so concurrent calls to useSettings() in the same
// tick (e.g. two components mounting together) share one Dexie read instead
// of racing several. That alone does not order the load against a concurrent
// update() — see the `await loading` below for that half of the guarantee.
let loading: Promise<void> | null = null;

/**
 * One shared reactive record for the whole app. Loaded once; every screen that
 * needs a setting reads this rather than touching Dexie.
 */
export function useSettings() {
  if (import.meta.client) ensureStatusBarAutoListener();
  if (!loading && import.meta.client) {
    loading = loadSettings()
      .then((loaded) => {
        settings.value = loaded;
        ready.value = true;
        applyTheme(loaded);
      })
      .catch((err: unknown) => {
        // Self-healing: a failed initial read (quota, a blocked
        // `versionchange`) must not wedge every future `useSettings()` call
        // behind this one rejection forever — clearing `loading` lets the
        // *next* call retry Dexie from scratch (e.g. the learner opening
        // Settings after the underlying issue clears). The rejection itself
        // still propagates to whoever is awaiting *this* call's `loading`
        // (`settingsLoaded()`'s startup plugin, a concurrent `update()`).
        console.error('useSettings: failed to load the initial settings', err);
        loading = null;
        throw err;
      });
  }

  async function update(patch: Partial<Settings>): Promise<void> {
    // Wait for the initial load to settle before applying a patch. Without
    // this, a patch applied while the first read is still in flight (nothing
    // stops a caller from calling update() before `ready` flips) can be
    // overwritten when that slow read finally resolves and unconditionally
    // assigns its now-stale snapshot to settings.value.
    if (loading) await loading;
    settings.value = await saveSettings(patch);
    applyTheme(settings.value);
  }

  return { settings: readonly(settings), ready: readonly(ready), update };
}

/**
 * Resolves once the shared settings record has loaded and the theme has been
 * applied to `<html>` at least once. Awaited from a startup plugin so the
 * theme attribute is set before the app's first paint, rather than flashing
 * the default (dark) theme for a frame while Dexie's read is in flight.
 * Starts the same load `useSettings()` would, deduped through the same
 * module-scope `loading` guard, so calling this first costs nothing extra
 * once a page's own `useSettings()` runs.
 */
export function settingsLoaded(): Promise<void> {
  useSettings();
  return loading ?? Promise.resolve();
}

/**
 * Kanto drives both themes from one attribute, and the Chinese typeface from
 * an application token, so switching either is an attribute write and no CSS.
 */
function applyTheme(value: Settings): void {
  const root = document.documentElement;
  root.dataset.theme = value.theme;
  root.dataset.hanziFont = value.hanziFont;
  syncStatusBar(value);
}

/** Whether `theme` renders dark, resolving `auto` against the OS preference — the same resolution Kanto's own `[data-theme='auto']` CSS performs. */
function resolvesDark(theme: Settings['theme']): boolean {
  if (theme === 'dark') return true;
  if (theme === 'light') return false;
  return typeof window === 'undefined' || !window.matchMedia ? true : window.matchMedia('(prefers-color-scheme: dark)').matches;
}

/**
 * Android-only: the status bar sits outside the WebView, so no CSS token
 * reaches it. A no-op in the browser (`Capacitor.isNativePlatform()` is
 * false there, same guard `back-button.client.ts` uses) and never thrown
 * through to a caller — a failed native call here must not stop the theme
 * itself from applying.
 */
function syncStatusBar(value: Settings): void {
  if (!Capacitor.isNativePlatform()) return;
  StatusBar.setStyle({ style: resolvesDark(value.theme) ? Style.Dark : Style.Light }).catch((err: unknown) => {
    console.error('useSettings: failed to sync the Android status bar', err);
  });
}
