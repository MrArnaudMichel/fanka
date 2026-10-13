<script setup lang="ts">
import type { KtTableColumn, KtTableRow } from 'kanto-ds';
import { html } from 'lit';
import { type DeckRow, type FilteredSnapshot, type HardItem, type StatsWindow, deckComparison, memorySummary, rate, trimChart } from '~core/stats';
import { formatPercent, plural, shortDate } from '~/utils/format';

/** `everyDeck` is the snapshot on no deck and no mode: the Decks table compares them all. */
const props = defineProps<{ data: FilteredSnapshot; everyDeck: FilteredSnapshot; window: StatsWindow; now: number }>();
const emit = defineEmits<{ deck: [deckId: string] }>();
const s = computed(() => memorySummary(props.data, props.window, props.now));
/**
 * `kt-chart`'s `values` is `readonly number[]` (model.d.ts) — no `null` gap
 * support, and the renderer does not special-case a missing point: a
 * `null` silently coerces to 0 in its position arithmetic (plots as the
 * floor of the range) while `undefined`/`NaN` produces a stray point at the
 * plot's origin (verified against the compiled renderer). Falling back to 0
 * reproduces exactly what a raw `null` would already do, so this is not a
 * behaviour change, just a type-safe way to write it down.
 *
 * `retentionChart` below runs the series through `trimChart` first, which
 * drops a bucket where neither line has a point and a line that has no
 * point anywhere left — so the only 0 `pct(null)` can still draw is a
 * bucket where the *other* line has a real point and this one does not.
 * See docs/deferred-minors.md for that remaining gap.
 */
const pct = (v: number | null) => (v === null ? 0 : Math.round(v * 100));

/** At least two points to read as a line; the tiles above already give the window's one-number figure. */
const retentionChart = computed(() =>
  trimChart(
    s.value.retentionSeries.map((p) => shortDate(p.key)),
    [
      { name: 'Young', values: s.value.retentionSeries.map((p) => p.young) },
      { name: 'Mature', values: s.value.retentionSeries.map((p) => p.mature) },
    ],
  ),
);

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

const decks = computed(() => deckComparison(props.everyDeck, props.window, props.now).map((d) => ({ ...d, id: d.deckId })));
const deckColumns: KtTableColumn[] = [
  { key: 'name', label: 'Deck' },
  { key: 'known', label: 'Known', align: 'right' },
  { key: 'learning', label: 'Learning', align: 'right' },
  { key: 'retention', label: 'Mature retention', align: 'right' },
  { key: 'practice', label: 'Practised', align: 'right' },
];

function renderDeckCell(row: KtTableRow, column: KtTableColumn): unknown {
  const r = row as unknown as DeckRow;
  if (column.key === 'known') return `${r.known} / ${r.words}`;
  if (column.key === 'retention') return formatPercent(rate(r.retention));
  if (column.key === 'practice') return r.practised === 0 ? '—' : `${plural(r.practised, 'word')} · ${formatPercent(rate(r.practice))}`;
  return undefined;
}

function openDeck(event: CustomEvent<{ row: DeckRow }>): void {
  emit('deck', event.detail.row.deckId);
}

function openCard(event: CustomEvent<{ row: HardItem }>): void {
  void navigateTo(`/cards/${event.detail.row.cardId}`);
}
</script>

<template>
  <kt-empty-state
    v-if="data.items.length === 0 && data.reviews.length === 0"
    icon="chart-line"
    heading="Nothing scheduled yet"
    description="Add cards and review them to see how your memory holds."
  />

  <div v-else class="tab">
    <div class="tiles">
      <kt-stat label="Retention, young" :value="formatPercent(rate(s.retention.young))" :caption="plural(s.retention.young.total, 'answer')" />
      <kt-stat label="Retention, mature" :value="formatPercent(rate(s.retention.mature))" :caption="plural(s.retention.mature.total, 'answer')" />
      <kt-stat label="New" :value="String(s.cardStates.new)" />
      <kt-stat label="Learning" :value="String(s.cardStates.learning)" />
      <kt-stat label="Young" :value="String(s.cardStates.young)" />
      <kt-stat label="Mature" :value="String(s.cardStates.mature)" />
    </div>

    <kt-card v-if="retentionChart.labels.length >= 2">
      <div slot="header" class="card-heading">Retention, %</div>
      <kt-chart
        type="line"
        label="Retention"
        height="220"
        :labels="retentionChart.labels"
        :series="retentionChart.series.map((series) => ({ name: series.name, values: series.values.map(pct) }))"
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
      <div slot="header" class="card-heading">Decks</div>
      <p class="caption">Every deck in the period, whatever the filters above. Select one to filter the page on it.</p>
      <kt-table label="Decks" :columns="deckColumns" :data="decks" :renderCell="renderDeckCell" compact empty-text="No decks yet." @kt-row-click="openDeck" />
    </kt-card>

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
.caption { font: var(--font-normal-small); color: var(--text-muted); margin: 0 0 var(--gap-element); }
</style>
