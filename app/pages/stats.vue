<script setup lang="ts">
import StatsActivity from '~/components/stats/StatsActivity.vue';
import StatsJournal from '~/components/stats/StatsJournal.vue';
import StatsMemory from '~/components/stats/StatsMemory.vue';
import StatsOverview from '~/components/stats/StatsOverview.vue';
import StatsWriting from '~/components/stats/StatsWriting.vue';
import { useStats } from '~/composables/useStats';

const { loading, loadError, filter, filtered, everyMode, deckOptions, now, load } = useStats();

const tab = ref<'overview' | 'activity' | 'memory' | 'writing' | 'journal'>('overview');
const tabs = [
  { value: 'overview', label: 'Overview' },
  { value: 'activity', label: 'Activity' },
  { value: 'memory', label: 'Memory' },
  { value: 'writing', label: 'Writing' },
  { value: 'journal', label: 'Journal' },
];
const windows = [
  { value: '7d', label: '7 d' },
  { value: '30d', label: '30 d' },
  { value: '90d', label: '90 d' },
  { value: '1y', label: '1 y' },
  { value: 'all', label: 'All' },
];
const modes = [
  { value: 'all', label: 'All' },
  { value: 'review', label: 'Review' },
  { value: 'writing', label: 'Writing' },
];

onMounted(load);

/** Endless practice on these cards only (`?cards=`), in recognition: the weak words come from both modes. */
function practise(cardIds: string[]): void {
  void navigateTo({ path: '/review', query: { endless: '1', cards: cardIds.join(',') } });
}
</script>

<template>
  <div class="stats">
    <kt-page-header eyebrow="Progress" heading="Statistics" description="Where you stand, how you study and every answer you gave." />

    <kt-skeleton v-if="loading" height="200px" />

    <kt-empty-state v-else-if="loadError" icon="triangle-alert" heading="Couldn't load your stats" description="Something went wrong reading the database. Try again.">
      <kt-button slot="actions" variant="secondary" size="medium" icon="refresh-cw" @click="load">Retry</kt-button>
    </kt-empty-state>

    <template v-else-if="filtered">
      <div class="filters">
        <kt-segmented-control size="small" label="Period" :options="windows" :value="filter.window" @kt-change="(e: CustomEvent) => (filter.window = e.detail.value)" />
        <kt-segmented-control size="small" label="Mode" :options="modes" :value="filter.mode ?? 'all'" @kt-change="(e: CustomEvent) => (filter.mode = e.detail.value === 'all' ? null : e.detail.value)" />
        <kt-select size="small" label="Deck" placeholder="All decks" clearable :options="deckOptions" :value="filter.deckId" @kt-change="(e: CustomEvent) => (filter.deckId = e.detail?.value ?? null)" />
      </div>

      <kt-tabs label="Statistics" :tabs="tabs" :value="tab" @kt-change="(e: CustomEvent) => (tab = e.detail.value)" />

      <StatsOverview v-if="tab === 'overview'" :data="filtered" :every-mode="everyMode!" :window="filter.window" :now="now" @practise="practise" />
      <StatsActivity v-else-if="tab === 'activity'" :data="filtered" :window="filter.window" :now="now" />
      <StatsMemory v-else-if="tab === 'memory'" :data="filtered" :window="filter.window" :now="now" />
      <StatsWriting v-else-if="tab === 'writing'" :data="filtered" :window="filter.window" :now="now" />
      <StatsJournal v-else :data="filtered" :window="filter.window" :now="now" />
    </template>
  </div>
</template>

<style scoped>
.stats { display: flex; flex-direction: column; gap: var(--gap-card); }
.filters { display: flex; flex-wrap: wrap; align-items: end; gap: var(--gap-button); }
</style>
