<script setup lang="ts">
import { computed, onMounted, ref } from 'vue';
import { useStats } from '~/composables/useStats';
import type { StatsSummary } from '~core/db/repositories';

const { summary } = useStats();

const loading = ref(true);
const loadError = ref(false);
const data = ref<StatsSummary | null>(null);

async function load(): Promise<void> {
  loading.value = true;
  loadError.value = false;
  try {
    data.value = await summary();
  } catch (err) {
    console.error('stats: failed to load the summary', err);
    loadError.value = true;
  } finally {
    loading.value = false;
  }
}

onMounted(load);

const hasHistory = computed(() => (data.value?.reviewsPerDay ?? []).some((d) => d.count > 0));

/** `9/23` from `2026-09-23` — short enough for 30 tick labels on a phone width. */
const dayLabels = computed(() => (data.value?.reviewsPerDay ?? []).map((d) => `${Number(d.date.slice(5, 7))}/${Number(d.date.slice(8, 10))}`));
const dayCounts = computed(() => (data.value?.reviewsPerDay ?? []).map((d) => d.count));

const answerLabels = ['Again', 'Hard', 'Good', 'Easy'];
const answerSeries = computed(() => {
  const mix = data.value?.answerMix;
  return [{ name: 'Reviews', values: mix ? [mix.again, mix.hard, mix.good, mix.easy] : [0, 0, 0, 0] }];
});

const streakLabel = computed(() => {
  const days = data.value?.streakDays ?? 0;
  return `${days} day${days === 1 ? '' : 's'}`;
});
</script>

<template>
  <div class="stats">
    <kt-page-header eyebrow="Progress" heading="Statistics" description="Review activity and where your cards stand." />

    <kt-skeleton v-if="loading" height="200px" />

    <kt-empty-state
      v-else-if="loadError"
      icon="triangle-alert"
      heading="Couldn't load your stats"
      description="Something went wrong reading the database. Try again."
    >
      <kt-button slot="actions" variant="secondary" size="medium" icon="refresh-cw" @click="load">Retry</kt-button>
    </kt-empty-state>

    <template v-else-if="data">
      <div class="tiles">
        <kt-stat label="Current streak" :value="streakLabel" icon="flame" />
        <kt-stat label="New" :value="String(data.cardStates.new)" />
        <kt-stat label="Learning" :value="String(data.cardStates.learning)" />
        <kt-stat label="Young" :value="String(data.cardStates.young)" />
        <kt-stat label="Mature" :value="String(data.cardStates.mature)" />
      </div>

      <kt-empty-state
        v-if="!hasHistory"
        icon="chart-line"
        heading="No review history yet"
        description="Study a few cards to see your activity here."
      >
        <kt-button slot="actions" variant="primary" size="medium" icon="play" @click="navigateTo('/review')">Start reviewing</kt-button>
      </kt-empty-state>

      <template v-else>
        <kt-card>
          <div slot="header" class="card-heading">Reviews per day, last 30 days</div>
          <kt-chart type="area" label="Reviews per day" height="220" :labels="dayLabels" :series="[{ name: 'Reviews', values: dayCounts }]" />
        </kt-card>

        <kt-card>
          <div slot="header" class="card-heading">Answer mix</div>
          <kt-chart type="doughnut" label="Answer mix" height="220" center-label="Reviews" :labels="answerLabels" :series="answerSeries" />
        </kt-card>
      </template>
    </template>
  </div>
</template>

<style scoped>
.stats { display: flex; flex-direction: column; gap: var(--gap-card); }
.tiles { display: grid; grid-template-columns: repeat(auto-fit, minmax(140px, 1fr)); gap: var(--gap-button); }
.card-heading { font: var(--font-title-h6); color: var(--text-body); }
</style>
