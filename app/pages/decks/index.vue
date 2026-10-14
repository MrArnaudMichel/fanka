<script setup lang="ts">
import { toaster } from 'kanto-ds';
import { computed, onMounted, ref } from 'vue';
import DeckCard from '~/components/DeckCard.vue';
import DeckFormModal from '~/components/DeckFormModal.vue';
import { useDecks } from '~/composables/useDecks';
import { useStudyDecks } from '~/composables/useStudyDecks';
import type { DeckSummary } from '~core/db/repositories';
import type { Deck } from '~core/db/schema';
import { groupByLesson } from '~core/lessons';

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

const study = useStudyDecks();

onMounted(() => {
  study.load().catch((err: unknown) => console.error('decks: failed to load the study selection', err));
});

/** Only decks still on the page count; a deleted deck left in the selection is ignored. */
const studyingCount = computed(() => rows.value.filter((r) => study.ids.value.includes(r.deck.id)).length);

const studyLine = computed(() =>
  studyingCount.value === 0
    ? 'Studying all decks'
    : `Studying ${studyingCount.value} of ${rows.value.length} deck${rows.value.length === 1 ? '' : 's'}`,
);

async function onStudy(deck: Deck, studying: boolean): Promise<void> {
  try {
    await study.toggle(deck.id, studying);
  } catch (err) {
    console.error('decks: failed to save the study selection', err);
    toaster.error("Couldn't save your selection", { description: 'Try again.' });
  }
}

async function clearStudy(): Promise<void> {
  try {
    await study.clear();
  } catch (err) {
    console.error('decks: failed to clear the study selection', err);
    toaster.error("Couldn't clear your selection", { description: 'Try again.' });
  }
}

/** No tag on any deck: no lesson headings, the decks as one grid. */
const lessons = computed(() => groupByLesson(rows.value, (r) => r.deck));
const grouped = computed(() => lessons.value.some((g) => g.lesson !== null));

function lessonStudy(group: { items: DeckSummary[] }): { all: boolean; some: boolean } {
  const n = group.items.filter((r) => study.ids.value.includes(r.deck.id)).length;
  return { all: n === group.items.length, some: n > 0 && n < group.items.length };
}

function lessonCounts(group: { items: DeckSummary[] }): string {
  const due = group.items.reduce((sum, r) => sum + r.due, 0);
  const fresh = group.items.reduce((sum, r) => sum + r.fresh, 0);
  return `${group.items.length} deck${group.items.length === 1 ? '' : 's'} · ${due} due · ${fresh} new`;
}

async function onStudyLesson(group: { items: DeckSummary[] }, studying: boolean): Promise<void> {
  try {
    await study.toggleMany(
      group.items.map((r) => r.deck.id),
      studying,
    );
  } catch (err) {
    console.error('decks: failed to save the study selection', err);
    toaster.error("Couldn't save your selection", { description: 'Try again.' });
  }
}

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

    <template v-else>
      <div class="study-line">
        <p>{{ studyLine }}</p>
        <kt-button v-if="studyingCount > 0" variant="secondary-no-bg" size="small" @click="clearStudy">Clear</kt-button>
      </div>

      <template v-if="grouped">
        <section v-for="group in lessons" :key="group.lesson ?? ''" class="lesson">
          <div class="lesson-head">
            <kt-checkbox
              size="small"
              :checked="lessonStudy(group).all"
              :indeterminate="lessonStudy(group).some"
              :label="`Study ${group.lesson ?? 'the other decks'}`"
              @kt-change="(e: CustomEvent<{ checked: boolean }>) => onStudyLesson(group, e.detail.checked)"
            />
            <h2>{{ group.lesson ?? 'Other decks' }}</h2>
            <span class="lesson-counts">{{ lessonCounts(group) }}</span>
          </div>
          <div class="grid">
            <DeckCard
              v-for="row in group.items"
              :key="row.deck.id"
              :deck="row.deck"
              mode="full"
              :summary="row"
              :studying="study.ids.value.includes(row.deck.id)"
              hide-tag
              @edit="openEdit"
              @delete="openDelete"
              @study="onStudy"
            />
          </div>
        </section>
      </template>

      <div v-else class="grid">
        <DeckCard
          v-for="row in rows"
          :key="row.deck.id"
          :deck="row.deck"
          mode="full"
          :summary="row"
          :studying="study.ids.value.includes(row.deck.id)"
          @edit="openEdit"
          @delete="openDelete"
          @study="onStudy"
        />
      </div>
    </template>

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
.study-line { display: flex; align-items: center; gap: var(--gap-button); }
.study-line p { margin: 0; font: var(--font-normal-small); color: var(--text-muted); }
.lesson { display: flex; flex-direction: column; gap: var(--gap-element); }
.lesson-head { display: flex; align-items: center; gap: var(--gap-element); }
.lesson-head h2 { margin: 0; font: var(--font-title-h6); color: var(--text-body); }
.lesson-counts { margin-left: auto; font: var(--font-normal-small); color: var(--text-muted); }
.grid { display: grid; grid-template-columns: repeat(auto-fill, minmax(280px, 1fr)); gap: var(--gap-button); }
</style>
