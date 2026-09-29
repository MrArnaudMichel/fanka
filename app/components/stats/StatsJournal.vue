<script setup lang="ts">
import type { KtTableColumn, KtTableRow } from 'kanto-ds';
import { html } from 'lit';
import { type FilteredSnapshot, type JournalFilter, type JournalRow, type StatsWindow, journalRows } from '~core/stats';
import { useCompactLayout } from '~/composables/useCompactLayout';
import { formatDuration } from '~/utils/format';

const props = defineProps<{ data: FilteredSnapshot; window: StatsWindow; now: number }>();

const filter = reactive<JournalFilter>({ source: null, result: null });
const rows = computed(() => journalRows(props.data, props.window, props.now, filter));

const sources = [
  { value: 'all', label: 'All' },
  { value: 'scheduled', label: 'Scheduled' },
  { value: 'practice', label: 'Practice' },
];
const results = [
  { value: 'all', label: 'All' },
  { value: 'right', label: 'Right' },
  { value: 'wrong', label: 'Wrong' },
];

const GRADE = { 1: ['Again', 'danger'], 2: ['Hard', 'warning'], 3: ['Good', 'success'], 4: ['Easy', 'info'] } as const;
const when = new Intl.DateTimeFormat('en', { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' });

const { compact } = useCompactLayout();

/** At phone width, seven columns crowd — keep only When, Card, Answer and Writing (CardTable.vue's compact pattern). */
const columns = computed<KtTableColumn[]>(() => {
  if (compact.value) {
    return [
      { key: 'at', label: 'When' },
      { key: 'hanzi', label: 'Card' },
      { key: 'grade', label: 'Answer' },
      { key: 'verdict', label: 'Writing' },
    ];
  }
  return [
    { key: 'at', label: 'When' },
    { key: 'hanzi', label: 'Card' },
    { key: 'deckName', label: 'Deck' },
    { key: 'mode', label: 'Mode' },
    { key: 'grade', label: 'Answer' },
    { key: 'durationMs', label: 'Time', align: 'right' },
    { key: 'verdict', label: 'Writing' },
  ];
});

function renderCell(row: KtTableRow, column: KtTableColumn): unknown {
  const r = row as unknown as JournalRow;
  if (column.key === 'at') return when.format(r.at);
  if (column.key === 'hanzi') return html`<span style="font-family: var(--fk-font-hanzi)">${r.hanzi}</span>`;
  if (column.key === 'mode') return `${r.mode === 'writing' ? 'Writing' : 'Review'}${r.source === 'practice' ? ' · practice' : ''}`;
  if (column.key === 'grade') {
    const [label, tone] = GRADE[r.grade];
    return html`<kt-badge variant="tag" tone="${tone}" size="small">${label}</kt-badge>`;
  }
  if (column.key === 'durationMs') return formatDuration(r.durationMs);
  if (column.key === 'verdict') return r.verdict || '—';
  return undefined;
}

function openCard(event: CustomEvent<{ row: JournalRow }>): void {
  void navigateTo(`/cards/${event.detail.row.cardId}`);
}
</script>

<template>
  <div class="tab">
    <div class="filters">
      <kt-segmented-control size="small" label="Source" :options="sources" :value="filter.source ?? 'all'" @kt-change="(e: CustomEvent) => (filter.source = e.detail.value === 'all' ? null : e.detail.value)" />
      <kt-segmented-control size="small" label="Result" :options="results" :value="filter.result ?? 'all'" @kt-change="(e: CustomEvent) => (filter.result = e.detail.value === 'all' ? null : e.detail.value)" />
      <span class="count">{{ rows.length }} answer{{ rows.length === 1 ? '' : 's' }}</span>
    </div>
    <kt-table label="Journal" :columns="columns" :data="rows" :renderCell="renderCell" page-size="25" compact empty-text="No answers match." @kt-row-click="openCard" />
  </div>
</template>

<style scoped>
.tab { display: flex; flex-direction: column; gap: var(--gap-card); }
.filters { display: flex; flex-wrap: wrap; align-items: center; gap: var(--gap-button); }
.count { font: var(--font-normal-small); font-family: var(--font-family-code); color: var(--text-muted); }
</style>
