<script setup lang="ts">
import type { KtTableColumn, KtTableRow } from 'kanto-ds';
import { html } from 'lit';
import type { CharacterStrokes } from '~core/chinese/strokes';
import { type FilteredSnapshot, type MissedCharacter, type StatsWindow, rate, trimChart, writingSummary } from '~core/stats';
import { useStrokeData } from '~/composables/useStrokeData';
import { formatPercent, shortDate } from '~/utils/format';

const props = defineProps<{ data: FilteredSnapshot; window: StatsWindow; now: number }>();
const s = computed(() => writingSummary(props.data.attempts, props.window, props.now));
/** See StatsMemory.vue's `pct` for why a missing bucket falls back to 0 rather than `null`, and `accuracyChart` for why that is now the only case left. */
const pct = (v: number | null) => (v === null ? 0 : Math.round(v * 100));

/** At least two points to read as a line; the tiles above already give the window's one-number figure. */
const accuracyChart = computed(() =>
  trimChart(
    s.value.series.map((p) => shortDate(p.key)),
    [
      { name: 'Character', values: s.value.series.map((p) => p.character) },
      { name: 'Stroke order', values: s.value.series.map((p) => p.order) },
    ],
  ),
);

const ERROR_LABELS = { 'stroke-count': 'Stroke count', 'stroke-shape': 'Stroke shape', 'stroke-order': 'Stroke order', 'stroke-direction': 'Stroke direction' } as const;

const columns: KtTableColumn[] = [
  { key: 'character', label: 'Character' },
  { key: 'attempts', label: 'Drawn', align: 'right' },
  { key: 'shapeRate', label: 'Right', align: 'right' },
  { key: 'orderRate', label: 'In order', align: 'right' },
  { key: 'lastError', label: 'Last error' },
];

function renderCell(row: KtTableRow, column: KtTableColumn): unknown {
  const r = row as unknown as MissedCharacter;
  if (column.key === 'character') return html`<span style="font-family: var(--fk-font-hanzi)">${r.character}</span>`;
  if (column.key === 'shapeRate') return formatPercent(r.shapeRate);
  if (column.key === 'orderRate') return formatPercent(r.orderRate);
  if (column.key === 'lastError') return r.lastError ? ERROR_LABELS[r.lastError] : '—';
  return undefined;
}

const { load } = useStrokeData();
const open = ref<{ character: string; model: CharacterStrokes } | null>(null);
const panelOpen = ref(false);

async function openCharacter(event: CustomEvent<{ row: MissedCharacter }>): Promise<void> {
  const character = event.detail.row.character;
  const model = await load(character);
  if (!model) return;
  open.value = { character, model };
  panelOpen.value = true;
}
</script>

<template>
  <kt-empty-state v-if="s.checked.total === 0" icon="pen-line" heading="No writing yet" description="Draw a few characters in Writing to see how you write them.">
    <kt-button slot="actions" variant="primary" size="medium" icon="play" @click="navigateTo('/writing')">Start writing</kt-button>
  </kt-empty-state>

  <div v-else class="tab">
    <div class="tiles">
      <kt-stat label="Characters right" :value="formatPercent(rate(s.character))" :caption="`${s.character.total} drawn`" />
      <kt-stat label="In stroke order" :value="formatPercent(rate(s.order))" :caption="`of ${s.order.total} right`" />
      <kt-stat label="Checked by the app" :value="formatPercent(rate(s.checked))" :caption="`${s.checked.total} answers`" />
    </div>

    <kt-card v-if="accuracyChart.labels.length >= 2">
      <div slot="header" class="card-heading">Accuracy, %</div>
      <kt-chart
        type="line"
        label="Writing accuracy"
        height="220"
        :labels="accuracyChart.labels"
        :series="accuracyChart.series.map((series) => ({ name: series.name, values: series.values.map(pct) }))"
      />
    </kt-card>

    <kt-card>
      <div slot="header" class="card-heading">Errors</div>
      <kt-chart type="doughnut" label="Errors by kind" height="200" center-label="Errors" :labels="Object.values(ERROR_LABELS)" :series="[{ name: 'Errors', values: Object.keys(ERROR_LABELS).map((k) => s.errors[k as keyof typeof ERROR_LABELS]) }]" />
    </kt-card>

    <kt-card>
      <div slot="header" class="card-heading">Characters to work on</div>
      <kt-table label="Characters to work on" :columns="columns" :data="s.missed.map((m) => ({ ...m, id: m.character }))" :renderCell="renderCell" compact empty-text="No mistakes in this period." @kt-row-click="openCharacter" />
    </kt-card>

    <kt-side-panel :open="panelOpen" eyebrow="Stroke order" :heading="open?.character ?? ''" @kt-close="panelOpen = false">
      <StrokeOrderPanel v-if="open" :entries="[{ character: open.character, model: open.model, highlight: null }]" />
    </kt-side-panel>
  </div>
</template>

<style scoped>
.tab { display: flex; flex-direction: column; gap: var(--gap-card); }
.tiles { display: grid; grid-template-columns: repeat(auto-fit, minmax(160px, 1fr)); gap: var(--gap-button); }
.card-heading { font: var(--font-title-h6); color: var(--text-body); }
</style>
