<script setup lang="ts">
import { toaster } from 'kanto-ds';
import { findRadical, matchesQuery, RADICAL_GROUPS, RADICALS, type Radical, radicalForms, radicalId } from '~core/radicals';
import RadicalDetail from '~/components/RadicalDetail.vue';
import RadicalQuiz from '~/components/RadicalQuiz.vue';

/**
 * The radicals (部首): browse them by theme, open one for its forms,
 * characters and stroke order, drill them in a quiz, or add them as a deck
 * so the scheduler brings them back.
 */
const { supported, speak } = useSpeech();
const { deckId, present, adding, check, add } = useRadicalDeck();
onMounted(check);

const TABS = [
  { value: 'learn', label: 'Learn', panel: 'learn-panel' },
  { value: 'quiz', label: 'Quiz', panel: 'quiz-panel' },
];
const tab = ref<'learn' | 'quiz'>('learn');

const query = ref('');
const groups = computed(() =>
  RADICAL_GROUPS.map((g) => ({ ...g, radicals: RADICALS.filter((r) => r.group === g.id && matchesQuery(r, query.value)) })).filter((g) => g.radicals.length > 0),
);

const open = ref<Radical | null>(null);
const panelOpen = ref(false);
function show(radical: Radical): void {
  open.value = radical;
  panelOpen.value = true;
}
function showId(id: string): void {
  const radical = findRadical(id);
  if (radical) show(radical);
}

async function addDeck(): Promise<void> {
  try {
    const added = await add();
    toaster.success('Radicals deck added', { description: `${added} card${added === 1 ? '' : 's'} to review` });
  } catch (err) {
    console.error('radicals: could not add the deck', err);
    toaster.error("Couldn't add the radicals deck", { description: 'Try again.' });
  }
}
</script>

<template>
  <div class="radicals">
    <kt-page-header
      eyebrow="Practice"
      heading="Radicals"
      :description="`Radicals are the building blocks dictionaries file characters under. Learn the ${RADICALS.length} you will meet most, then test yourself.`"
    >
      <kt-button v-if="present" slot="actions" variant="secondary" icon="layers" @click="navigateTo(`/decks/${deckId}`)">Open deck</kt-button>
      <kt-button v-else-if="present === false" slot="actions" variant="primary" icon="plus" :disabled="adding" @click="addDeck">Add as a deck</kt-button>
    </kt-page-header>

    <kt-tabs label="Radicals" :tabs="TABS" :value="tab" @kt-change="(e: CustomEvent) => (tab = e.detail.value)" />

    <div v-show="tab === 'learn'" id="learn-panel" role="tabpanel" class="panel">
      <kt-input type="search" icon="search" label="Search radicals" placeholder="Search by radical, meaning or pinyin" :value="query" @kt-input="(e: CustomEvent) => (query = e.detail.value)" @kt-clear="query = ''" />

      <kt-empty-state v-if="groups.length === 0" icon="search" heading="No radical matches" description="Try a meaning such as water, or pinyin such as shui." />

      <section v-for="g in groups" :key="g.id" class="group" :aria-label="g.label">
        <p class="overline">{{ g.label }} · {{ g.radicals.length }}</p>
        <div class="grid">
          <kt-card v-for="r in g.radicals" :key="radicalId(r)" clickable :aria-label="`${r.radical}, ${r.meaning}`" @kt-card-click="show(r)">
            <div class="tile">
              <span class="tile-forms">{{ radicalForms(r).join(' ') }}</span>
              <span class="tile-pinyin">{{ r.pinyin }}</span>
              <span class="tile-meaning">{{ r.meaning }}</span>
            </div>
          </kt-card>
        </div>
      </section>
    </div>

    <div v-if="tab === 'quiz'" id="quiz-panel" role="tabpanel">
      <RadicalQuiz :can-speak="supported" @speak="speak" @open="showId" />
    </div>

    <kt-side-panel :open="panelOpen" size="medium" eyebrow="Radical" :heading="open ? `${open.radical} ${open.meaning}` : ''" @kt-close="panelOpen = false">
      <RadicalDetail v-if="open" :radical="open" :can-speak="supported" @speak="speak" />
    </kt-side-panel>
  </div>
</template>

<style scoped>
/* Same outer page gap as index.vue's .today, and for the same reason. */
.radicals { display: flex; flex-direction: column; gap: 24px; }
.panel { display: flex; flex-direction: column; gap: 24px; }
.group { display: flex; flex-direction: column; gap: var(--gap-button); }
.overline { margin: 0; font: var(--font-title-overline); letter-spacing: var(--letter-spacing-overline); text-transform: uppercase; color: var(--text-muted); }
.grid { display: grid; grid-template-columns: repeat(auto-fill, minmax(140px, 1fr)); gap: var(--gap-button); }
.tile { display: flex; flex-direction: column; align-items: center; gap: 4px; text-align: center; }
.tile-forms { font-family: var(--fk-font-hanzi); font-size: 40px; line-height: 1.2; color: var(--text-body); }
.tile-pinyin { font-family: var(--font-family-code); font-size: 13px; color: var(--text-muted); }
.tile-meaning { font: var(--font-normal-small); color: var(--text-body); }
</style>
