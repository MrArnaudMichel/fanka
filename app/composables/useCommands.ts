import type { KtNavSection } from 'kanto-ds';
import { useAuth } from '~/composables/useAuth';
import { SETTINGS_SECTIONS } from '~/composables/useNavigation';
import { resolvesDark, useSettings } from '~/composables/useSettings';
import { useSync } from '~/composables/useSync';
import { buildCommands } from '~/utils/commands';

/** The command palette's list and what picking one does. */
export function useCommands(sections: Readonly<Ref<KtNavSection[]>>) {
  const { user } = useAuth();
  const { settings, update } = useSettings();
  const { syncNow } = useSync();

  const commands = computed(() =>
    buildCommands({ sections: sections.value, settings: SETTINGS_SECTIONS, signedIn: !!user.value, dark: resolvesDark(settings.value.theme) }),
  );

  async function run(id: string): Promise<void> {
    if (id.startsWith('go:')) {
      await navigateTo(id.slice('go:'.length));
    } else if (id === 'action:sync') {
      await syncNow();
    } else if (id === 'action:theme') {
      await update({ theme: resolvesDark(settings.value.theme) ? 'light' : 'dark' });
    }
  }

  return { commands, run };
}
