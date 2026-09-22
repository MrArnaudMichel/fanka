<script setup lang="ts">
import type { KtOption, KtSegmentedOption, KtTableColumn, KtTableRow } from 'kanto';
import { toaster } from 'kanto';
import { html } from 'lit';
import CardDetailPanel from '~/components/CardDetailPanel.vue';
import { type BrowseRow, type BrowseState, STATE_META, useBrowse } from '~/composables/useBrowse';
import { useDecks } from '~/composables/useDecks';
import { toneColorToken } from '~core/chinese/tones';
import type { Deck, Review } from '~core/db/schema';
import { formatInterval } from '~core/srs/format';

/**
 * The Browse table: filters, bulk actions, the table itself and the row side
 * panel, all in one place so Task 13's deck detail screen can reuse it
 * unchanged — `scope` fixes the deck, hides the deck filter and the Deck
 * column, and `useBrowse(scope)` then never reads `filter.deckId` at all.
 * `defaultDeckId` is /browse's own `?deck=<id>` preset (Browse's deck filter
 * stays changeable; `scope` is not that — it is a permanent constraint).
 */
const props = defineProps<{ scope?: { deckId: string }; defaultDeckId?: string }>();

const { rows, filter, sort, setSort, clearFilters, selected, loading, reload, suspend, unsuspend, move, remove, history } = useBrowse(
  props.scope,
);

const decks = ref<Deck[]>([]);
const { listAll } = useDecks();

onMounted(async () => {
  decks.value = await listAll();
  if (!props.scope && props.defaultDeckId && decks.value.some((d) => d.id === props.defaultDeckId)) {
    filter.deckId = props.defaultDeckId;
  }
});

const deckOptions = computed<KtOption[]>(() => decks.value.map((d) => ({ id: d.id, label: d.name })));

// --- Filters ---------------------------------------------------------------

// Behaviour, not a styling duration — see CLAUDE.md's "Never hard-code a
// colour, size, duration or radius"; a named constant is the carve-out it
// grants for exactly this case.
const SEARCH_DEBOUNCE_MS = 200;
let searchTimer: ReturnType<typeof setTimeout> | undefined;

function onSearchInput(event: CustomEvent<{ value: string }>): void {
  const value = event.detail.value;
  clearTimeout(searchTimer);
  searchTimer = setTimeout(() => {
    filter.query = value;
  }, SEARCH_DEBOUNCE_MS);
}

onBeforeUnmount(() => clearTimeout(searchTimer));

const STATE_OPTIONS: KtOption[] = [
  { id: 'new', label: 'New' },
  { id: 'learning', label: 'Learning' },
  { id: 'relearning', label: 'Relearning' },
  { id: 'review', label: 'Review' },
  { id: 'suspended', label: 'Suspended' },
];

function onStateChange(event: CustomEvent<{ value: string | number | null }>): void {
  filter.state = typeof event.detail.value === 'string' ? (event.detail.value as BrowseState) : null;
}

function onDeckFilterChange(event: CustomEvent<{ value: string | number | null }>): void {
  filter.deckId = typeof event.detail.value === 'string' ? event.detail.value : null;
}

// Ruling 2: "Both" means `dir` is undefined — the segmented control needs a
// concrete value to display as selected, so `null` is presented as `'both'`
// and mapped back on the way out.
const DIRECTION_OPTIONS: KtSegmentedOption[] = [
  { value: 'both', label: 'Both' },
  { value: 'recognition', label: 'Recognition' },
  { value: 'production', label: 'Production' },
];
const directionValue = computed(() => filter.dir ?? 'both');
function onDirectionChange(event: CustomEvent<{ value: string | number }>): void {
  const value = event.detail.value;
  filter.dir = value === 'recognition' || value === 'production' ? value : null;
}

const isFiltered = computed(
  () => filter.state !== null || filter.dir !== null || filter.query.trim() !== '' || (!props.scope && filter.deckId !== null),
);

const addCardHref = computed(() => {
  const deckId = props.scope?.deckId ?? filter.deckId;
  return deckId ? `/cards/new?deck=${deckId}` : '/cards/new';
});

/** Task 14: the same `?deck=<id>` preset as `addCardHref`, once /import exists. */
const importHref = computed(() => {
  const deckId = props.scope?.deckId ?? filter.deckId;
  return deckId ? `/import?deck=${deckId}` : '/import';
});

// --- Table -------------------------------------------------------------

const columns = computed<KtTableColumn[]>(() => {
  const cols: KtTableColumn[] = [
    { key: 'hanzi', label: 'Hanzi', sortable: true, width: '140px' },
    { key: 'pinyin', label: 'Pinyin', width: '160px' },
    { key: 'translation', label: 'Translation', sortable: true },
  ];
  if (!props.scope) cols.push({ key: 'deckName', label: 'Deck', sortable: true });
  cols.push({ key: 'state', label: 'State', sortable: true, align: 'center' });
  cols.push({ key: 'due', label: 'Due', sortable: true, align: 'right' });
  return cols;
});

/**
 * `renderCell` is bound as a property (`:render-cell`), not an attribute —
 * it is a function, and Kanto data goes in as properties (CLAUDE.md). Every
 * branch reads the real card/state, never the numeric `hanzi` rank — see
 * `useBrowse.ts`'s `BrowseRow` for why that field is not display text.
 */
function renderCell(row: KtTableRow, column: KtTableColumn): unknown {
  const r = row as unknown as BrowseRow;
  if (column.key === 'hanzi') {
    return html`<span style="font-family: var(--fk-font-hanzi)">${r.card.hanzi}</span>`;
  }
  if (column.key === 'pinyin') {
    return html`<span class="pinyin-cell"
      >${r.card.pinyin.map((s) => html`<span style="color: ${toneColorToken(s.tone)}">${s.text}</span>`)}</span
    >`;
  }
  if (column.key === 'state') {
    const meta = STATE_META[r.state];
    return html`<kt-badge variant="tag" tone="${meta.tone}" size="small">${meta.label}</kt-badge>`;
  }
  if (column.key === 'due') {
    if (r.state === 'suspended' || r.due === null) return html`<span class="due-empty">—</span>`;
    const now = Date.now();
    return r.due <= now
      ? html`<kt-badge variant="tag" tone="danger" size="small">Due</kt-badge>`
      : html`<span>${formatInterval(r.due - now)}</span>`;
  }
  return undefined;
}

function onSortChange(event: CustomEvent<{ key: string | null; direction: 'asc' | 'desc' | null }>): void {
  setSort(event.detail.key, event.detail.direction);
}

function onSelectionChange(event: CustomEvent<{ selected: unknown[] }>): void {
  selected.value = event.detail.selected as string[];
}

const tableEl = ref<HTMLElement | null>(null);
const openCardId = ref<string | null>(null);
const panelRow = computed<BrowseRow | null>(() => rows.value.find((r) => r.id === openCardId.value) ?? null);
const historyRows = ref<Review[]>([]);
const historyLoading = ref(false);

watch(openCardId, async (id) => {
  if (!id) return;
  historyLoading.value = true;
  try {
    historyRows.value = await history(id);
  } finally {
    historyLoading.value = false;
  }
});

/**
 * `<kt-side-panel>` is a native `<dialog>`: `close()` restores focus to
 * whatever held it when `showModal()` ran (see kt-side-panel.md, "Built on
 * `<dialog>`"). A `<tr>` has no `tabindex`, so a mouse click on one never
 * actually focuses it — without this, the "previously focused" element at
 * open time is whatever was last focused (often the page's last input, or
 * nothing at all), and closing the panel would not return focus to the row.
 *
 * This has to run *before* `openCardId` is set, not after: verified in a
 * real browser, opening the panel (`showModal()`) already steals focus for
 * itself well within the same synchronous click that fires `kt-row-click` —
 * a separate `@click` listener on `<kt-table>` that ran its own focus call
 * after that point was consistently too late (`document.activeElement` was
 * already the panel). Doing it first here, ahead of the reactive write,
 * means the row is genuinely the "previously focused element" `close()`
 * reads back later, however Vue and the browser end up interleaving the
 * rest. `event.detail.index` is the row's position among `visibleRows`
 * (kt-table.ts's `renderBody`), which is exactly the current page's
 * `tbody tr` order — reached through the table's own (open) shadow root
 * since Kanto renders rows there, not in the light DOM.
 */
function onRowClick(event: CustomEvent<{ row: KtTableRow; index: number }>): void {
  const rowEl = tableEl.value?.shadowRoot?.querySelectorAll('tbody tr')[event.detail.index] as HTMLElement | undefined;
  if (rowEl) {
    if (!rowEl.hasAttribute('tabindex')) rowEl.setAttribute('tabindex', '-1');
    rowEl.focus({ preventScroll: true });
  }
  const row = event.detail.row as unknown as BrowseRow;
  openCardId.value = row.id;
}

function closePanel(): void {
  openCardId.value = null;
}

// --- Actions -------------------------------------------------------------

/** Ruling 4: reload, drop any selection that no longer surfaces, toast, and — only on failure — leave everything as it was. */
async function runAction(action: () => Promise<void>, successMessage: string): Promise<boolean> {
  try {
    await action();
    await reload();
    const present = new Set(rows.value.map((r) => r.id));
    selected.value = selected.value.filter((id) => present.has(id));
    toaster.success(successMessage);
    return true;
  } catch (err) {
    console.error('CardTable: action failed', err);
    toaster.error("Couldn't complete that action", { description: 'Try again.' });
    return false;
  }
}

function plural(n: number, noun: string): string {
  return `${n} ${noun}${n === 1 ? '' : 's'}`;
}

const selectedRows = computed(() => rows.value.filter((r) => selected.value.includes(r.id)));
const canSuspend = computed(() => selectedRows.value.some((r) => r.state !== 'suspended'));
const canUnsuspend = computed(() => selectedRows.value.some((r) => r.state === 'suspended'));

async function onBulkSuspend(): Promise<void> {
  const ids = selected.value.slice();
  await runAction(() => suspend(ids), `${plural(ids.length, 'card')} suspended`);
}

async function onBulkUnsuspend(): Promise<void> {
  const ids = selected.value.slice();
  await runAction(() => unsuspend(ids), `${plural(ids.length, 'card')} unsuspended`);
}

const moveOpen = ref(false);
const moveTargetDeckId = ref<string | null>(null);

function openMove(): void {
  moveTargetDeckId.value = null;
  moveOpen.value = true;
}

function onMoveTargetChange(event: CustomEvent<{ value: string | number | null }>): void {
  moveTargetDeckId.value = typeof event.detail.value === 'string' ? event.detail.value : null;
}

async function confirmMove(): Promise<void> {
  const target = moveTargetDeckId.value;
  if (!target) return;
  const ids = selected.value.slice();
  moveOpen.value = false;
  await runAction(() => move(ids, target), `${plural(ids.length, 'card')} moved`);
}

const deleteConfirmOpen = ref(false);
const deleteIds = ref<string[]>([]);
const deleteMessage = computed(() => `Delete ${plural(deleteIds.value.length, 'card')}? Their review history is kept.`);

function openBulkDelete(): void {
  deleteIds.value = selected.value.slice();
  deleteConfirmOpen.value = true;
}

function openPanelDelete(cardId: string): void {
  deleteIds.value = [cardId];
  deleteConfirmOpen.value = true;
}

async function confirmDelete(): Promise<void> {
  const ids = deleteIds.value;
  deleteConfirmOpen.value = false;
  const wasFromPanel = openCardId.value !== null && ids.includes(openCardId.value);
  const ok = await runAction(() => remove(ids), `${plural(ids.length, 'card')} deleted`);
  // Ruling 5: deleting from the side panel closes it — but only once the
  // delete actually succeeded; a failed delete leaves the panel exactly as
  // it was, same as everything else in `runAction`.
  if (ok && wasFromPanel) closePanel();
}

async function onPanelSuspend(cardId: string): Promise<void> {
  await runAction(() => suspend([cardId]), 'Card suspended');
}

async function onPanelUnsuspend(cardId: string): Promise<void> {
  await runAction(() => unsuspend([cardId]), 'Card unsuspended');
}
</script>

<template>
  <div class="card-table">
    <div class="filters">
      <kt-input class="search" icon="search" placeholder="Search hanzi, pinyin or translation" :value="filter.query" @kt-input="onSearchInput" />
      <kt-select
        v-if="!scope"
        class="deck-filter"
        label="Deck"
        placeholder="All decks"
        :options="deckOptions"
        :value="filter.deckId"
        @kt-change="onDeckFilterChange"
      />
      <kt-select class="state-filter" label="State" placeholder="All states" :options="STATE_OPTIONS" :value="filter.state" @kt-change="onStateChange" />
      <kt-segmented-control label="Direction" :options="DIRECTION_OPTIONS" :value="directionValue" @kt-change="onDirectionChange" />
    </div>

    <div v-if="selected.length > 0" class="bulk-bar">
      <span class="bulk-count">{{ plural(selected.length, 'card') }} selected</span>
      <kt-button v-if="canSuspend" variant="secondary" size="small" icon="pause" @click="onBulkSuspend">Suspend</kt-button>
      <kt-button v-if="canUnsuspend" variant="secondary" size="small" icon="play" @click="onBulkUnsuspend">Unsuspend</kt-button>
      <kt-button variant="secondary" size="small" icon="move" @click="openMove">Move</kt-button>
      <kt-button variant="delete" size="small" icon="trash-2" @click="openBulkDelete">Delete</kt-button>
    </div>

    <kt-empty-state
      v-if="!loading && rows.length === 0 && !isFiltered"
      icon="inbox"
      heading="No cards yet"
      description="Add your first card to start building this collection."
    >
      <kt-button slot="actions" variant="primary" size="medium" icon="plus" @click="navigateTo(addCardHref)">Add a card</kt-button>
      <kt-button slot="actions" variant="secondary" size="medium" icon="upload" @click="navigateTo(importHref)">Import</kt-button>
    </kt-empty-state>

    <kt-empty-state
      v-else-if="!loading && rows.length === 0 && isFiltered"
      icon="search"
      heading="No cards match"
      description="Try a different search or fewer filters."
    >
      <kt-button slot="actions" variant="secondary" size="medium" icon="x" @click="clearFilters">Clear filters</kt-button>
    </kt-empty-state>

    <!--
      `:renderCell` (camelCase, not `:render-cell`): Vue only assigns a bound
      value as a DOM *property* on a custom element when the binding key
      matches that property's name exactly (`shouldSetAsProp` checks
      `key in el` using the literal key Vue was given, never re-camelised for
      a plain/custom element). `renderCell` has no attribute mirror at all
      (`@property({ attribute: false })` in kt-table.ts), so `:render-cell`
      silently fell back to `setAttribute` — a no-op for a function — and
      every cell rendered its raw value instead (a number for the hanzi
      rank, a lowercase state, a raw due timestamp). Verified in a real
      browser; see the report's "Fix round 1". `sort-key`/`sort-direction`
      below are fine as kebab-case: kt-table declares an explicit `attribute:`
      name for both, so Lit reflects the attribute into the property itself.
    -->
    <kt-table
      v-else
      ref="tableEl"
      label="Cards"
      :columns="columns"
      :data="rows"
      :renderCell="renderCell"
      :sort-key="sort.key"
      :sort-direction="sort.direction"
      selectable
      selection-mode="multiple"
      :selected="selected"
      page-size="25"
      :loading="loading"
      @kt-sort-change="onSortChange"
      @kt-selection-change="onSelectionChange"
      @kt-row-click="onRowClick"
    />

    <CardDetailPanel
      :open="panelRow !== null"
      :row="panelRow"
      :history-rows="historyRows"
      :history-loading="historyLoading"
      @close="closePanel"
      @suspend="onPanelSuspend"
      @unsuspend="onPanelUnsuspend"
      @delete="openPanelDelete"
    />

    <form novalidate @submit.prevent="confirmMove">
      <kt-modal :open="moveOpen" heading="Move cards" :description="`Move ${plural(selected.length, 'card')} to another deck.`" @kt-close="moveOpen = false">
        <kt-label-input label="Deck" required>
          <kt-select :options="deckOptions" required :clearable="false" :value="moveTargetDeckId" @kt-change="onMoveTargetChange" />
        </kt-label-input>
        <kt-button slot="footer" variant="dark" type="button" @click="moveOpen = false">Cancel</kt-button>
        <kt-button slot="footer" type="submit" :disabled="!moveTargetDeckId">Move</kt-button>
      </kt-modal>
    </form>

    <kt-confirm-dialog
      :open="deleteConfirmOpen"
      heading="Delete cards?"
      :message="deleteMessage"
      confirm-label="Delete"
      variant="danger"
      @kt-confirm="confirmDelete"
      @kt-cancel="deleteConfirmOpen = false"
    />
  </div>
</template>

<style scoped>
.card-table { display: flex; flex-direction: column; gap: var(--gap-button); }
.filters { display: flex; flex-wrap: wrap; align-items: flex-end; gap: var(--gap-element); }
.filters .search { flex: 1 1 240px; min-width: 0; }
.filters .deck-filter,
.filters .state-filter { flex: 0 1 200px; min-width: 160px; }

.bulk-bar {
  display: flex;
  align-items: center;
  gap: var(--gap-element);
  padding: var(--gap-drag-drop) var(--padding-card);
  background: var(--surface-card);
  border-radius: var(--border-radius);
}
.bulk-count { font: var(--font-normal-small); color: var(--text-muted); margin-right: auto; }

.pinyin-cell { display: inline-flex; gap: var(--gap-button); font-family: var(--font-family-code); }
.due-empty { color: var(--text-muted); }
</style>
