import type { KtNavSection } from 'kanto-ds';
import { useAuth } from '~/composables/useAuth';
import { useDecks } from '~/composables/useDecks';
import { SETTINGS_SECTIONS } from '~/composables/useNavigation';
import { resolvesDark, useSettings } from '~/composables/useSettings';
import { useSync } from '~/composables/useSync';
import { buildCommands } from '~/utils/commands';

/** The command palette's list and what picking one does. */
export function useCommands(sections: Readonly<Ref<KtNavSection[]>>) {
  const { user } = useAuth();
  const { settings, update } = useSettings();
  const { syncNow } = useSync();

  const { listAll } = useDecks();
  const decks = ref<{ id: string; name: string }[]>([]);

  /** Read when the palette opens, so a deck made a moment ago is already there. Never throws: the palette still offers everything else. */
  async function refreshDecks(): Promise<void> {
    try {
      decks.value = (await listAll()).map((d) => ({ id: d.id, name: d.name }));
    } catch (err) {
      console.error('useCommands: could not list decks', err);
    }
  }

  const commands = computed(() =>
    buildCommands({
      sections: sections.value,
      settings: SETTINGS_SECTIONS,
      decks: decks.value,
      signedIn: !!user.value,
      dark: resolvesDark(settings.value.theme),
    }),
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

  return { commands, run, refreshDecks };
}
