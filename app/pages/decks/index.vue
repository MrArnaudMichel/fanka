<script setup lang="ts">
import { toaster } from 'kanto-ds';
import { computed, onMounted, ref } from 'vue';
import DeckCard from '~/components/DeckCard.vue';
import DeckFormModal from '~/components/DeckFormModal.vue';
import { useDecks } from '~/composables/useDecks';
import type { DeckSummary } from '~core/db/repositories';
import type { Deck } from '~core/db/schema';

const { summaries: fetchSummaries, remove } = useDecks();

const rows = ref<DeckSummary[]>([]);
const loading = ref(true);
// Same distinction as the Today page's `loadError`: a genuinely failed read
// (quota, blocked versionchange) is not the same on-screen state as "there
// are none", even though both start `rows` at an empty array.
const loadError = ref(false);

async function loadDecks(): Promise<void> {
  loading.value = true;
  loadError.value = false;
  try {
    rows.value = await fetchSummaries();
  } catch (err) {
    console.error('decks: failed to load the deck list', err);
    loadError.value = true;
  } finally {
    loading.value = false;
  }
}

onMounted(loadDecks);

const formOpen = ref(false);
const editingDeck = ref<Deck | null>(null);

function openCreate(): void {
  editingDeck.value = null;
  formOpen.value = true;
}

function openEdit(deck: Deck): void {
  editingDeck.value = deck;
  formOpen.value = true;
}

function onFormClose(): void {
  formOpen.value = false;
}

async function onFormSaved(): Promise<void> {
  formOpen.value = false;
  await loadDecks();
}

const deleteTarget = ref<DeckSummary | null>(null);

function openDelete(deck: Deck): void {
  deleteTarget.value = rows.value.find((r) => r.deck.id === deck.id) ?? null;
}

const deleteMessage = computed(() => {
  const target = deleteTarget.value;
  if (!target) return '';
  const count = target.total;
  return `Delete ${target.deck.name} and its ${count} card${count === 1 ? '' : 's'}? Their review history is kept.`;
});

async function confirmDelete(): Promise<void> {
  const target = deleteTarget.value;
  if (!target) return;
  deleteTarget.value = null;
  try {
    await remove(target.deck.id);
    toaster.success('Deck deleted', { description: target.deck.name });
    await loadDecks();
  } catch (err) {
    console.error('decks: failed to delete the deck', err);
    toaster.error("Couldn't delete that deck", { description: 'Try again.' });
  }
}
</script>

<template>
  <div class="decks">
    <kt-page-header eyebrow="Collection" heading="Decks" description="Group cards by topic, level or anything else you study by.">
      <kt-button slot="actions" variant="primary" size="medium" icon="plus" @click="openCreate">New deck</kt-button>
    </kt-page-header>

    <kt-skeleton v-if="loading" height="200px" />

    <kt-empty-state
      v-else-if="loadError"
      icon="triangle-alert"
      heading="Couldn't load your decks"
      description="Something went wrong reading the database. Try again."
    >
      <kt-button slot="actions" variant="secondary" size="medium" icon="refresh-cw" @click="loadDecks">Retry</kt-button>
    </kt-empty-state>

    <kt-empty-state
      v-else-if="rows.length === 0"
      icon="layers"
      heading="No decks yet"
      description="Create a deck to start adding cards."
    >
      <kt-button slot="actions" variant="primary" size="medium" icon="plus" @click="openCreate">New deck</kt-button>
    </kt-empty-state>

    <div v-else class="grid">
      <DeckCard
        v-for="row in rows"
        :key="row.deck.id"
        :deck="row.deck"
        mode="full"
        :summary="row"
        @edit="openEdit"
        @delete="openDelete"
      />
    </div>

    <DeckFormModal :open="formOpen" :deck="editingDeck" @close="onFormClose" @saved="onFormSaved" />

    <kt-confirm-dialog
      :open="deleteTarget !== null"
      heading="Delete deck?"
      :message="deleteMessage"
      confirm-label="Delete"
      variant="danger"
      @kt-confirm="confirmDelete"
      @kt-cancel="deleteTarget = null"
    />
  </div>
</template>

<style scoped>
.decks { display: flex; flex-direction: column; gap: 24px; }
.grid { display: grid; grid-template-columns: repeat(auto-fill, minmax(280px, 1fr)); gap: var(--gap-button); }
</style>
