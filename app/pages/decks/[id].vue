<script setup lang="ts">
import type { KtBreadcrumbItem, KtTab } from 'kanto-ds';
import { toaster } from 'kanto-ds';
import CardTable from '~/components/CardTable.vue';
import DeckFields from '~/components/DeckFields.vue';
import { useDecks } from '~/composables/useDecks';
// Type-only: erased at compile time, so this never touches the database
// layer at runtime — see test/integrity/kanto-first.test.ts's own reasoning
// for why a page may still name a `~core/db` *type*. `DECK_COLORS` (the
// runtime value) is deliberately not imported here; `draftColorToken`'s
// pre-load placeholder never reaches the screen (see below).
import type { DeckColor } from '~core/db/repositories';
import type { Deck } from '~core/db/schema';

const route = useRoute();
const router = useRouter();
const deckId = computed(() => String(route.params.id));

const { summaries, update, remove } = useDecks();

// --- Load ------------------------------------------------------------------

/**
 * There is no single-deck read in `useDecks` (Task 10 only exposed the list
 * and the summary sweep), and pages never touch `~core/db` directly — so
 * this reuses `summaries()`, the same call `/decks` already makes, and picks
 * the one row out. It also folds in the live card count the delete confirm
 * needs (ruling 5), for free, in the same read.
 */
const deck = ref<Deck | null>(null);
const cardCount = ref(0);
const loading = ref(true);
// A genuine read failure (quota, blocked versionchange) is a different
// on-screen state from "no such live deck" — same distinction decks/index.vue
// already draws between `loadError` and an empty `rows`.
const loadError = ref(false);

async function load(): Promise<void> {
  loading.value = true;
  loadError.value = false;
  try {
    const rows = await summaries();
    const row = rows.find((r) => r.deck.id === deckId.value);
    deck.value = row?.deck ?? null;
    cardCount.value = row?.total ?? 0;
    syncDraftFromDeck();
  } catch (err) {
    console.error('decks/[id]: failed to load the deck', err);
    loadError.value = true;
    deck.value = null;
  } finally {
    loading.value = false;
  }
}

// Ruling 7: an unknown *or soft-deleted* id — `summaries()` only ever
// returns live decks, so either case leaves `deck` unset the same way.
const notFound = computed(() => !loading.value && !loadError.value && deck.value === null);

watch(deckId, load, { immediate: true });

// --- Breadcrumb --------------------------------------------------------------

const breadcrumbItems = computed<KtBreadcrumbItem[]>(() => [{ label: 'Decks', href: '/decks' }, { label: deck.value?.name ?? '' }]);

/** Same cancel-and-route-through-Nuxt handling as AppSidebar's `kt-navigate`. */
function onBreadcrumbNavigate(event: CustomEvent<{ item: KtBreadcrumbItem; index: number }>): void {
  event.preventDefault();
  if (event.detail.item.href) navigateTo(event.detail.item.href);
}

// --- Tabs --------------------------------------------------------------------

const TAB_VALUES = ['cards', 'settings'] as const;
type TabValue = (typeof TAB_VALUES)[number];

const tabs: KtTab[] = [
  { value: 'cards', label: 'Cards' },
  { value: 'settings', label: 'Settings' },
];

// Ruling 6: unknown query value falls back to 'cards'.
const activeTab = computed<TabValue>(() => {
  const q = route.query.tab;
  return q === 'settings' ? 'settings' : 'cards';
});

/** `router.replace`, not push, so flipping tabs never floods browser history (ruling 6). */
function onTabChange(event: CustomEvent<{ value: string | number }>): void {
  const value: TabValue = event.detail.value === 'settings' ? 'settings' : 'cards';
  router.replace({ query: { ...route.query, tab: value } });
}

// --- Settings tab: fields ----------------------------------------------------

const draftName = ref('');
const draftDescription = ref('');
// Placeholder only: the Settings tab is never rendered until `deck` is
// loaded, at which point `syncDraftFromDeck` overwrites this with the real
// colour before anything paints it.
const draftColorToken = ref<DeckColor>('' as DeckColor);
const draftTag = ref('');
const settingsFieldsRef = ref<InstanceType<typeof DeckFields> | null>(null);
const savingSettings = ref(false);

/** Reseeds the Settings tab's draft from the just-loaded/just-saved deck. */
function syncDraftFromDeck(): void {
  if (!deck.value) return;
  draftName.value = deck.value.name;
  draftDescription.value = deck.value.description;
  draftColorToken.value = deck.value.colorToken as DeckColor;
  draftTag.value = deck.value.tag;
  settingsFieldsRef.value?.resetValidation();
}

/**
 * Ruling 4: an explicit Save button, a success toast, and — on failure — a
 * toast plus the inputs left exactly as typed (the draft refs are untouched
 * by a thrown `update()`, so there is nothing to restore). Success also
 * updates `deck` in place, which is what the header and breadcrumb below
 * read their heading from — no reload of the whole page needed.
 */
async function onSettingsSubmit(): Promise<void> {
  if (!deck.value || !settingsFieldsRef.value?.validate()) return;
  savingSettings.value = true;
  try {
    const patch = { name: draftName.value, description: draftDescription.value, colorToken: draftColorToken.value, tag: draftTag.value };
    await update(deck.value.id, patch);
    deck.value = { ...deck.value, ...patch };
    toaster.success('Deck updated', { description: draftName.value });
  } catch (err) {
    console.error('decks/[id]: failed to save the deck', err);
    toaster.error("Couldn't save that deck", { description: 'Try again.' });
  } finally {
    savingSettings.value = false;
  }
}

// --- Settings tab: delete ------------------------------------------------

const deleteOpen = ref(false);

/** Task 10's wording, reused verbatim (ruling 5). */
const deleteMessage = computed(() => {
  if (!deck.value) return '';
  const count = cardCount.value;
  return `Delete ${deck.value.name} and its ${count} card${count === 1 ? '' : 's'}? Their review history is kept.`;
});

async function confirmDelete(): Promise<void> {
  if (!deck.value) return;
  const target = deck.value;
  deleteOpen.value = false;
  try {
    await remove(target.id);
    toaster.success('Deck deleted', { description: target.name });
    await navigateTo('/decks');
  } catch (err) {
    console.error('decks/[id]: failed to delete the deck', err);
    toaster.error("Couldn't delete that deck", { description: 'Try again.' });
  }
}
</script>

<template>
  <div class="deck-detail">
    <kt-skeleton v-if="loading" height="200px" />

    <kt-empty-state
      v-else-if="loadError"
      icon="triangle-alert"
      heading="Couldn't load this deck"
      description="Something went wrong reading the database. Try again."
    >
      <kt-button slot="actions" variant="secondary" size="medium" icon="refresh-cw" @click="load">Retry</kt-button>
    </kt-empty-state>

    <kt-empty-state
      v-else-if="notFound"
      icon="triangle-alert"
      heading="Deck not found"
      description="This deck doesn't exist, or it was deleted."
    >
      <kt-button slot="actions" variant="primary" size="medium" icon="arrow-left" @click="navigateTo('/decks')">Back to decks</kt-button>
    </kt-empty-state>

    <template v-else-if="deck">
      <kt-breadcrumb :items="breadcrumbItems" @kt-navigate="onBreadcrumbNavigate" />

      <kt-page-header eyebrow="Collection" :heading="deck.name" :description="deck.description">
        <kt-button slot="actions" variant="primary" size="medium" icon="plus" @click="navigateTo(`/cards/new?deck=${deck.id}`)">Add card</kt-button>
      </kt-page-header>

      <kt-tabs :tabs="tabs" :value="activeTab" @kt-change="onTabChange" />

      <div v-show="activeTab === 'cards'" id="cards-panel" role="tabpanel">
        <CardTable :scope="{ deckId: deck.id }" />
      </div>

      <div v-show="activeTab === 'settings'" id="settings-panel" role="tabpanel" class="settings">
        <form novalidate @submit.prevent="onSettingsSubmit">
          <DeckFields
            ref="settingsFieldsRef"
            v-model:name="draftName"
            v-model:description="draftDescription"
            v-model:color-token="draftColorToken"
            v-model:tag="draftTag"
          />
          <kt-button type="submit" :disabled="savingSettings">Save</kt-button>
        </form>

        <section class="danger-zone">
          <p class="danger-copy">Deleting a deck keeps its cards' review history but removes the deck itself.</p>
          <kt-button variant="delete" size="medium" icon="trash-2" @click="deleteOpen = true">Delete deck</kt-button>
        </section>
      </div>

      <kt-confirm-dialog
        :open="deleteOpen"
        heading="Delete deck?"
        :message="deleteMessage"
        confirm-label="Delete"
        variant="danger"
        @kt-confirm="confirmDelete"
        @kt-cancel="deleteOpen = false"
      />
    </template>
  </div>
</template>

<style scoped>
.deck-detail { display: flex; flex-direction: column; gap: var(--gap-button); }
.settings { display: flex; flex-direction: column; gap: 24px; max-width: 480px; }
.danger-zone { display: flex; flex-direction: column; align-items: flex-start; gap: var(--gap-element); padding-top: var(--gap-button); border-top: var(--border-width) solid var(--border-subtle); }
.danger-copy { margin: 0; font: var(--font-normal-small); color: var(--text-muted); }
</style>
