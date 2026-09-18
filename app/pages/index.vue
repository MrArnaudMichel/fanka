<script setup lang="ts">
import { decks as deckRepo } from '~core/db/repositories';
import type { Deck } from '~core/db/schema';
import { seedIfNeeded } from '~core/seed/seed';
import { useDueCounts } from '~/composables/useDueCounts';
import { useSeedStatus } from '~/composables/useSeedStatus';

const { total, byState, refresh } = useDueCounts();
const { failed: seedFailed, markFailed: markSeedFailed, clear: clearSeedFailed } = useSeedStatus();

const decks = ref<Deck[]>([]);

/**
 * Distinguishes "still fetching the deck list" from "fetched, and there
 * genuinely are none" — both start as an empty `decks` array, and only the
 * second should ever show an empty/error state. Without this, every load
 * (not just a first launch) flashes "No decks yet" for the beat between
 * mount and `listAll()` resolving, which on a *returning* launch is actively
 * misleading: it blames a seed step that already ran.
 */
const loadingDecks = ref(true);

/**
 * `refresh()` or `listAll()` can genuinely reject — quota exceeded, Safari
 * private browsing, a blocked `versionchange`. `loadingDecks` is cleared in
 * `finally` specifically so a rejection here can never leave the skeleton
 * showing forever with no error and no way out.
 */
const loadError = ref(false);

async function loadToday(): Promise<void> {
  loadingDecks.value = true;
  loadError.value = false;
  try {
    await refresh();
    decks.value = await deckRepo.listAll();
  } catch (err) {
    console.error('index: failed to load today’s data', err);
    loadError.value = true;
  } finally {
    loadingDecks.value = false;
  }
}

/** Retries the seed itself, not just the read — a seed failure needs redoing, not just re-reading the same empty tables. */
async function retrySeed(): Promise<void> {
  try {
    await seedIfNeeded(Date.now());
    clearSeedFailed();
  } catch (err) {
    console.error('index: retry seed failed', err);
    markSeedFailed();
    return;
  }
  await loadToday();
}

onMounted(loadToday);

/** Roughly eight seconds a card, which is what a steady session averages. */
const minutes = computed(() => Math.round((total.value * 8) / 60));

/**
 * `kt-button` has no `described-by` property — it sets `aria-label` on its
 * own shadow-internal `<button>` from a `label` property, but nothing
 * forwards an arbitrary host attribute across the shadow boundary (an
 * `aria-describedby` set on the `<kt-button>` host itself would not reach
 * the actual interactive element; Kanto's own `kt-tooltip` documents this
 * same constraint). Reaching into the shadow root directly is the same
 * technique `kt-button.focus()` uses internally, and the `updateComplete`
 * await mirrors `useFocusWhenEnabled`: a Lit element paints its shadow DOM
 * on its own microtask after connection, not synchronously within it.
 */
const startButton = ref<HTMLElement & { updateComplete?: Promise<boolean> }>();
onMounted(async () => {
  await startButton.value?.updateComplete;
  startButton.value?.shadowRoot?.querySelector('button')?.setAttribute('aria-describedby', 'today-eta');
});
</script>

<template>
  <div class="today">
    <header class="head">
      <p class="overline">Dashboard</p>
      <h1>Today</h1>
    </header>

    <kt-card>
      <div class="summary">
        <div class="counts">
          <kt-stat label="New" :value="String(byState.fresh)" size="small" />
          <kt-stat label="Learning" :value="String(byState.learning)" size="small" />
          <kt-stat label="To review" :value="String(byState.review)" size="small" />
        </div>
        <p id="today-eta" class="eta">
          <template v-if="total > 0">{{ total }} card{{ total === 1 ? '' : 's' }} due · about {{ minutes }} min</template>
          <template v-else>Nothing due right now</template>
        </p>
        <kt-button
          ref="startButton"
          variant="primary"
          size="large"
          icon="play"
          full-width
          :disabled="total === 0"
          @click="navigateTo('/review')"
        >
          Start session
        </kt-button>
      </div>
    </kt-card>

    <kt-skeleton v-if="loadingDecks" height="120px" />

    <kt-empty-state
      v-else-if="loadError"
      icon="triangle-alert"
      heading="Couldn't load today's data"
      description="Something went wrong reading the database. Try again."
    >
      <kt-button slot="actions" variant="secondary" size="medium" icon="refresh-cw" @click="loadToday">Retry</kt-button>
    </kt-empty-state>

    <kt-empty-state
      v-else-if="decks.length === 0 && seedFailed"
      icon="triangle-alert"
      heading="Setup didn't finish"
      description="The starter deck failed to load. Try again, or reload the page."
    >
      <kt-button slot="actions" variant="secondary" size="medium" icon="refresh-cw" @click="retrySeed">Retry</kt-button>
    </kt-empty-state>

    <kt-empty-state
      v-else-if="decks.length === 0"
      icon="layers"
      heading="No decks yet"
      description="Seeded decks load on first launch. If none appeared, reload the page."
    />

    <kt-card v-else>
      <p class="overline" slot="header">Decks</p>
      <ul class="decks">
        <li v-for="deck in decks" :key="deck.id">
          <span class="swatch" :style="{ background: deck.colorToken }" />
          <span class="name">{{ deck.name }}</span>
          <kt-badge variant="category" tone="neutral" size="small" :label="deck.tag" />
        </li>
      </ul>
    </kt-card>
  </div>
</template>

<style scoped>
/* No exact token for 24px here: --gap-sub-menu is scoped to sub-menu
   layout, and the codebase's own precedent (AppSidebar.vue, review.vue's
   .done-body) already treats this outer page gap as a literal rather than
   reaching for it. */
.today { display: flex; flex-direction: column; gap: 24px; }
.head { display: flex; flex-direction: column; gap: 2px; }
.overline { margin: 0; font: var(--font-title-overline); letter-spacing: var(--letter-spacing-overline); text-transform: uppercase; color: var(--text-muted); }
.head h1 { margin: 0; font: var(--font-title-h4); color: var(--text-body); }
.summary { display: flex; flex-direction: column; gap: var(--gap-form); }
/* 12px matches --gap-drag-drop by value only — that token names an
   interaction this grid has nothing to do with, so a literal is the
   honest choice (name-plus-value match wins over value alone). */
.counts { display: grid; grid-template-columns: repeat(auto-fit, minmax(120px, 1fr)); gap: 12px; }
.eta { margin: 0; font: var(--font-normal-small); color: var(--text-muted); }
.decks { list-style: none; margin: 0; padding: 0; display: flex; flex-direction: column; gap: var(--gap-button); }
.decks li { display: flex; align-items: center; gap: 10px; padding: 12px; border: var(--border-width) solid var(--border-subtle); border-radius: var(--border-radius); }
.swatch { width: 4px; height: 26px; border-radius: var(--radius-full); }
.name { flex: 1; min-width: 0; font: var(--font-normal-medium); color: var(--text-body); overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
</style>
