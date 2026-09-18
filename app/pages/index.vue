<script setup lang="ts">
import { decks as deckRepo } from '~core/db/repositories';
import type { Deck } from '~core/db/schema';
import { useDueCounts } from '~/composables/useDueCounts';

const { total, byState, refresh } = useDueCounts();
const decks = ref<Deck[]>([]);

/**
 * Distinguishes "still fetching the deck list" from "fetched, and there
 * genuinely are none" — both start as an empty `decks` array, and only the
 * second should ever show the "No decks yet" empty state. Without this,
 * every load (not just a first launch) flashes that message for the beat
 * between mount and `listAll()` resolving, which on a *returning* launch is
 * actively misleading: it blames a seed step that already ran.
 */
const loadingDecks = ref(true);

onMounted(async () => {
  await refresh();
  decks.value = await deckRepo.listAll();
  loadingDecks.value = false;
});

/** Roughly eight seconds a card, which is what a steady session averages. */
const minutes = computed(() => Math.round((total.value * 8) / 60));
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
        <p class="eta">
          <template v-if="total > 0">{{ total }} card{{ total === 1 ? '' : 's' }} due · about {{ minutes }} min</template>
          <template v-else>Nothing due right now</template>
        </p>
        <kt-button
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
      v-else-if="decks.length === 0"
      icon="layers"
      heading="No decks yet"
      description="Seeded decks load on first launch. If none appeared, reload the page."
    />

    <kt-card v-else>
      <h6 slot="header">Decks</h6>
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
.counts { display: grid; grid-template-columns: repeat(auto-fit, minmax(120px, 1fr)); gap: var(--gap-drag-drop); }
.eta { margin: 0; font: var(--font-normal-small); color: var(--text-muted); }
.decks { list-style: none; margin: 0; padding: 0; display: flex; flex-direction: column; gap: var(--gap-button); }
.decks li { display: flex; align-items: center; gap: 10px; padding: 12px; border: var(--border-width) solid var(--border-subtle); border-radius: var(--border-radius); }
.swatch { width: 4px; height: 26px; border-radius: var(--radius-full); }
.name { flex: 1; min-width: 0; font: var(--font-normal-medium); color: var(--text-body); overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
</style>
