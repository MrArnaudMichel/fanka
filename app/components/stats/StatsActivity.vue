<script setup lang="ts">
import ActivityCalendar from './ActivityCalendar.vue';
import { type FilteredSnapshot, type StatsWindow, activitySummary } from '~core/stats';
import { formatDuration, shortDate } from '~/utils/format';

const props = defineProps<{ data: FilteredSnapshot; window: StatsWindow; now: number }>();

const s = computed(() => activitySummary(props.data.attempts, props.window, props.now));
const days = (n: number) => `${n} day${n === 1 ? '' : 's'}`;
const minutes = (ms: number) => Math.round(ms / 6_000) / 10;
const hours = Array.from({ length: 24 }, (_, h) => String(h));
</script>

<template>
  <kt-empty-state v-if="data.attempts.length === 0" icon="chart-line" heading="No answers yet" description="Study a few cards to see your activity here.">
    <kt-button slot="actions" variant="primary" size="medium" icon="play" @click="navigateTo('/review')">Start reviewing</kt-button>
  </kt-empty-state>

  <div v-else class="tab">
    <div class="tiles">
      <kt-stat label="Current streak" :value="days(s.currentStreak)" icon="flame" />
      <kt-stat label="Best streak" :value="days(s.bestStreak)" icon="trophy" />
      <kt-stat label="Days studied" :value="String(s.daysStudied)" />
      <kt-stat label="Time studied" :value="formatDuration(s.totalMs)" icon="clock" />
      <kt-stat label="Per answer" :value="formatDuration(s.averageMs)" />
      <kt-stat label="Answers per day" :value="s.perStudyDay.toFixed(1)" />
    </div>

    <kt-card>
      <div slot="header" class="card-heading">Last year</div>
      <ActivityCalendar :days="s.calendar" />
    </kt-card>

    <kt-card>
      <div slot="header" class="card-heading">Minutes studied</div>
      <kt-chart
        type="bar"
        stacked
        label="Minutes studied"
        height="220"
        :labels="s.time.map((t) => shortDate(t.key))"
        :series="[
          { name: 'Scheduled', values: s.time.map((t) => minutes(t.scheduledMs)) },
          { name: 'Practice', values: s.time.map((t) => minutes(t.practiceMs)) },
        ]"
      />
    </kt-card>

    <div class="pair">
      <kt-card>
        <div slot="header" class="card-heading">Answers by hour</div>
        <kt-chart type="bar" label="Answers by hour" height="200" :labels="hours" :series="[{ name: 'Answers', values: s.byHour }]" />
      </kt-card>
      <kt-card>
        <div slot="header" class="card-heading">Review and writing</div>
        <kt-chart type="doughnut" label="Answers by mode" height="200" center-label="Answers" :labels="['Review', 'Writing']" :series="[{ name: 'Answers', values: [s.byMode.review, s.byMode.writing] }]" />
      </kt-card>
    </div>
  </div>
</template>

<style scoped>
.tab { display: flex; flex-direction: column; gap: var(--gap-card); }
.tiles { display: grid; grid-template-columns: repeat(auto-fit, minmax(140px, 1fr)); gap: var(--gap-button); }
.pair { display: grid; grid-template-columns: repeat(auto-fit, minmax(280px, 1fr)); gap: var(--gap-card); }
.card-heading { font: var(--font-title-h6); color: var(--text-body); }
</style>
