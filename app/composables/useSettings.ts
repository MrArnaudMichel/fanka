import { DEFAULT_SETTINGS, type Settings, loadSettings, saveSettings } from '~core/db/settings';

const settings = ref<Settings>({ ...DEFAULT_SETTINGS });
const ready = ref(false);

// Guards the initial load so concurrent calls to useSettings() in the same
// tick (e.g. two components mounting together) share one Dexie read instead
// of racing several. Without this, a later read resolving after an update()
// call would overwrite the freshly saved value with stale data.
let loading: Promise<void> | null = null;

/**
 * One shared reactive record for the whole app. Loaded once; every screen that
 * needs a setting reads this rather than touching Dexie.
 */
export function useSettings() {
  if (!loading && import.meta.client) {
    loading = loadSettings().then((loaded) => {
      settings.value = loaded;
      ready.value = true;
      applyTheme(loaded);
    });
  }

  async function update(patch: Partial<Settings>): Promise<void> {
    settings.value = await saveSettings(patch);
    applyTheme(settings.value);
  }

  return { settings: readonly(settings), ready: readonly(ready), update };
}

/**
 * Kanto drives both themes from one attribute, and the Chinese typeface from
 * an application token, so switching either is an attribute write and no CSS.
 */
function applyTheme(value: Settings): void {
  const root = document.documentElement;
  root.dataset.theme = value.theme;
  root.dataset.hanziFont = value.hanziFont;
}
