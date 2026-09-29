<script setup lang="ts">
import type { KtTableColumn, KtTableRow } from 'kanto-ds';
import { html } from 'lit';
import { type FilteredSnapshot, type HardItem, type StatsWindow, memorySummary, rate } from '~core/stats';
import { formatPercent, shortDate } from '~/utils/format';

const props = defineProps<{ data: FilteredSnapshot; window: StatsWindow; now: number }>();
const s = computed(() => memorySummary(props.data, props.window, props.now));
/**
 * `kt-chart`'s `values` is `readonly number[]` (model.d.ts) — no `null` gap
 * support, and the renderer does not special-case a missing point: a
 * `null` silently coerces to 0 in its position arithmetic (plots as the
 * floor of the range) while `undefined`/`NaN` produces a stray point at the
 * plot's origin (verified against the compiled renderer). Falling back to 0
 * reproduces exactly what a raw `null` would already do, so this is not a
 * behaviour change, just a type-safe way to write it down. See
 * docs/deferred-minors.md for the real gap this leaves.
 */
const pct = (v: number | null) => (v === null ? 0 : Math.round(v * 100));

const columns: KtTableColumn[] = [
  { key: 'hanzi', label: 'Card' },
  { key: 'translation', label: 'Meaning' },
  { key: 'mode', label: 'Mode' },
  { key: 'lapses', label: 'Lapses', align: 'right' },
  { key: 'failureRate', label: 'Missed', align: 'right' },
];

/** Renders inside kt-table's shadow root, so styling is inline and uses tokens. */
function renderCell(row: KtTableRow, column: KtTableColumn): unknown {
  const r = row as unknown as HardItem;
  if (column.key === 'hanzi') return html`<span style="font-family: var(--fk-font-hanzi)">${r.hanzi}</span>`;
  if (column.key === 'mode') return r.mode === 'writing' ? 'Writing' : 'Review';
  if (column.key === 'failureRate') return `${formatPercent(r.failureRate)} of ${r.reviews}`;
  return undefined;
}

function openCard(event: CustomEvent<{ row: HardItem }>): void {
  void navigateTo(`/cards/${event.detail.row.cardId}`);
}
</script>

<template>
  <div class="tab">
    <div class="tiles">
      <kt-stat label="Retention, young" :value="formatPercent(rate(s.retention.young))" :caption="`${s.retention.young.total} answers`" />
      <kt-stat label="Retention, mature" :value="formatPercent(rate(s.retention.mature))" :caption="`${s.retention.mature.total} answers`" />
      <kt-stat label="New" :value="String(s.cardStates.new)" />
      <kt-stat label="Learning" :value="String(s.cardStates.learning)" />
      <kt-stat label="Young" :value="String(s.cardStates.young)" />
      <kt-stat label="Mature" :value="String(s.cardStates.mature)" />
    </div>

    <kt-card v-if="s.retentionSeries.length">
      <div slot="header" class="card-heading">Retention, %</div>
      <kt-chart
        type="line"
        label="Retention"
        height="220"
        :labels="s.retentionSeries.map((p) => shortDate(p.key))"
        :series="[
          { name: 'Young', values: s.retentionSeries.map((p) => pct(p.young)) },
          { name: 'Mature', values: s.retentionSeries.map((p) => pct(p.mature)) },
        ]"
      />
    </kt-card>

    <kt-card>
      <div slot="header" class="card-heading">Due in the next 30 days</div>
      <kt-chart type="bar" label="Cards due per day" height="220" :labels="s.forecast.map((d) => shortDate(d.date))" :series="[{ name: 'Due', values: s.forecast.map((d) => d.count) }]" />
    </kt-card>

    <div class="pair">
      <kt-card>
        <div slot="header" class="card-heading">Intervals</div>
        <kt-chart type="bar" label="Cards by interval" height="200" :labels="s.intervals.map((b) => b.label)" :series="[{ name: 'Cards', values: s.intervals.map((b) => b.count) }]" />
      </kt-card>
      <kt-card>
        <div slot="header" class="card-heading">Answer mix</div>
        <kt-chart type="doughnut" label="Answer mix" height="200" center-label="Reviews" :labels="['Again', 'Hard', 'Good', 'Easy']" :series="[{ name: 'Reviews', values: [s.answerMix.again, s.answerMix.hard, s.answerMix.good, s.answerMix.easy] }]" />
      </kt-card>
    </div>

    <kt-card>
      <div slot="header" class="card-heading">Hardest cards</div>
      <kt-table label="Hardest cards" :columns="columns" :data="s.hardest" :renderCell="renderCell" compact empty-text="No lapses yet." @kt-row-click="openCard" />
    </kt-card>
  </div>
</template>

<style scoped>
.tab { display: flex; flex-direction: column; gap: var(--gap-card); }
.tiles { display: grid; grid-template-columns: repeat(auto-fit, minmax(140px, 1fr)); gap: var(--gap-button); }
.pair { display: grid; grid-template-columns: repeat(auto-fit, minmax(280px, 1fr)); gap: var(--gap-card); }
.card-heading { font: var(--font-title-h6); color: var(--text-body); }
</style>
