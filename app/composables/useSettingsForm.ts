import type { Settings } from '~core/db/settings';
import { useSettings } from '~/composables/useSettings';

/** Arrays come out of a reactive draft as proxies, which IndexedDB cannot clone. */
function plain<T>(value: T): T {
  return (Array.isArray(value) ? [...value] : value) as T;
}

/**
 * Local form state for one Settings page, seeded from the loaded record and
 * never re-synced while the page is open: a background `update()` from
 * another page must not overwrite what the learner is typing. Re-seeds once,
 * the instant `ready` flips true. `save()` writes the page's keys as one
 * patch and never throws; the page words the toast.
 */
export function useSettingsForm<K extends keyof Settings>(keys: readonly K[]) {
  const { settings, ready, update } = useSettings();
  const draft = reactive({}) as Pick<Settings, K>;
  const saving = ref(false);

  function seed(): void {
    for (const key of keys) (draft as Settings)[key] = plain(settings.value[key]) as Settings[K];
  }
  seed();
  watch(ready, (isReady) => {
    if (isReady) seed();
  });

  async function save(): Promise<boolean> {
    saving.value = true;
    try {
      const patch = {} as Partial<Settings>;
      for (const key of keys) (patch as Settings)[key] = plain((draft as Settings)[key]) as Settings[K];
      await update(patch);
      return true;
    } catch (err) {
      console.error('settings: failed to save', err);
      return false;
    } finally {
      saving.value = false;
    }
  }

  return { draft, ready, saving, save };
}
