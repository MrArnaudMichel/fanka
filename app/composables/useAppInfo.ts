import { Capacitor } from '@capacitor/core';

/** What Settings › About shows: which build this is, where it runs, how much it stores. */
export function useAppInfo() {
  const config = useRuntimeConfig().public;
  const storage = ref<{ usage: number; quota: number } | null>(null);

  async function loadStorage(): Promise<void> {
    try {
      const estimate = await navigator.storage?.estimate?.();
      if (estimate?.usage !== undefined && estimate.quota !== undefined) storage.value = { usage: estimate.usage, quota: estimate.quota };
    } catch (err) {
      console.error('useAppInfo: storage estimate failed', err);
    }
  }

  return {
    version: String(config.appVersion ?? ''),
    commit: String(config.appCommit ?? ''),
    builtAt: Number(config.appBuiltAt ?? 0),
    platform: Capacitor.getPlatform() === 'android' ? ('Android' as const) : ('Web' as const),
    storage,
    loadStorage,
  };
}
