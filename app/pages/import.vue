<script setup lang="ts">
import type { KtOption, KtSegmentedOption, KtStep, KtTableColumn, KtTableRow } from 'kanto-ds';
import { toaster } from 'kanto-ds';
import { html } from 'lit';
import DeckFormModal from '~/components/DeckFormModal.vue';
import { ImportCommitError, useImport } from '~/composables/useImport';
import type { Mapping, Target } from '~core/import/mapping';
import type { ImportRow } from '~core/import/rows';
import type { CardDraft } from '~core/import/validate';
import { plural } from '~/utils/format';
import { importSummary } from '~/utils/importSummary';

// Ruling 4: behaviour, not a styling token — see CLAUDE.md's carve-out for
// "no hard-coded colour, size, duration or radius" ("Where no token exists,
// add a comment").
const MAX_FILE_SIZE = 5 * 1024 * 1024;
const NEW_DECK_OPTION_ID = '__new_deck__';

const route = useRoute();
const {
  step,
  source,
  rows,
  mapping,
  results,
  counts,
  targetDeckId,
  decks: deckList,
  decksLoading,
  decksError,
  mappingRemembered,
  duplicatePolicy,
  fixRow,
  loadDecks,
  load,
  setMapping,
  verify,
  commit,
} = useImport();

// --- Destination deck --------------------------------------------------

/**
 * Loads the deck list, then picks the destination: the same `?deck=<id>`
 * preset as /cards/new and Browse — only when it still names a live deck —
 * or the first deck. Run on mount and by the load-failure Retry.
 */
async function initDecks(): Promise<void> {
  await loadDecks();
  if (decksError.value) return;
  const presetDeckId = typeof route.query.deck === 'string' ? route.query.deck : undefined;
  if (presetDeckId && deckList.value.some((d) => d.id === presetDeckId)) {
    targetDeckId.value = presetDeckId;
  } else {
    targetDeckId.value = deckList.value[0]?.id ?? null;
  }
}

onMounted(initDecks);

const deckOptions = computed<KtOption[]>(() => [
  ...deckList.value.map((d) => ({ id: d.id, label: d.name })),
  { id: NEW_DECK_OPTION_ID, label: 'New deck…' },
]);

const deckFormOpen = ref(false);

/**
 * Ruling 6: picking "New deck…" opens the modal without touching
 * `targetDeckId` at all — so a `kt-select` bound to the still-unchanged
 * value naturally shows the previous selection if the modal is cancelled,
 * with nothing to "restore".
 */
function onDeckSelectChange(event: CustomEvent<{ value: string | number | null }>): void {
  const value = event.detail.value;
  if (value === NEW_DECK_OPTION_ID) {
    deckFormOpen.value = true;
    return;
  }
  targetDeckId.value = typeof value === 'string' ? value : null;
}

function onDeckFormClose(): void {
  deckFormOpen.value = false;
}

/** The new deck is whichever id the reloaded list has that the pre-modal list didn't (DeckFormModal reports no id of its own — see its own file, not modified by this task). */
async function onDeckFormSaved(): Promise<void> {
  deckFormOpen.value = false;
  const before = new Set(deckList.value.map((d) => d.id));
  await loadDecks();
  const created = deckList.value.find((d) => !before.has(d.id));
  if (created) targetDeckId.value = created.id;
}

const STEPS: KtStep[] = [
  { id: 'source', label: 'Source' },
  { id: 'mapping', label: 'Field mapping' },
  { id: 'review', label: 'Review' },
];
const STEP_IDS = ['source', 'mapping', 'review'] as const;
const currentStepId = computed(() => STEP_IDS[step.value - 1]);

/** `navigable` only offers completed steps, so this only ever goes back. */
function onStepChange(event: CustomEvent<{ id: string }>): void {
  const index = STEP_IDS.indexOf(event.detail.id as (typeof STEP_IDS)[number]);
  if (index >= 0) step.value = (index + 1) as 1 | 2 | 3;
}

// --- Step 1: source ------------------------------------------------------

const SOURCE_OPTIONS: KtSegmentedOption[] = [
  { value: 'file', label: 'File' },
  { value: 'paste', label: 'Pasted text' },
];

function onSourceModeChange(event: CustomEvent<{ value: string | number }>): void {
  source.mode = event.detail.value === 'paste' ? 'paste' : 'file';
  sourceError.value = '';
}

const selectedFile = ref<File | null>(null);
const pastedText = ref('');
const sourceError = ref('');
const readingFile = ref(false);
// Read through the element's own `selectedFiles` getter after its change
// event, not `event.detail.files` — task-14-brief.md's own guidance for
// kt-drag-drop, so this stays the source of truth it actually holds rather
// than a copy of one particular event's payload.
const dragDropEl = ref<(HTMLElement & { selectedFiles: readonly File[] }) | null>(null);

function onFilesChange(): void {
  selectedFile.value = dragDropEl.value?.selectedFiles[0] ?? null;
  sourceError.value = '';
}

function onFilesRejected(event: CustomEvent<{ files: File[]; reason: 'type' | 'size' }>): void {
  sourceError.value = event.detail.reason === 'size' ? 'That file is larger than 5 MB.' : 'That file type is not supported.';
}

function onPastedInput(event: CustomEvent<{ value: string }>): void {
  pastedText.value = event.detail.value;
  sourceError.value = '';
}

const canContinueFromStep1 = computed(() => {
  if (!targetDeckId.value) return false;
  if (source.mode === 'file') return selectedFile.value !== null;
  return pastedText.value.trim().length > 0;
});

/**
 * The exact text `load()` last ran on — `null` before the first Continue.
 * Re-clicking Continue with the *same* text (Back, then forward again with
 * nothing changed) skips re-parsing entirely, so step 2's mapping edits
 * survive (ruling 5: "going back keeps the earlier choices"). Different
 * text re-parses and re-guesses the mapping from scratch, which is exactly
 * the "changing the source... invalidates the results" half of that ruling.
 */
const loadedText = ref<string | null>(null);

async function onContinueFromStep1(): Promise<void> {
  sourceError.value = '';
  if (!targetDeckId.value) {
    sourceError.value = 'Choose a destination deck.';
    return;
  }

  let text: string;
  if (source.mode === 'file') {
    if (!selectedFile.value) {
      sourceError.value = 'Choose a file.';
      return;
    }
    if (selectedFile.value.size > MAX_FILE_SIZE) {
      sourceError.value = 'That file is larger than 5 MB.';
      return;
    }
    readingFile.value = true;
    try {
      text = await selectedFile.value.text();
    } catch (err) {
      console.error('import: failed to read the file', err);
      sourceError.value = "Couldn't read that file.";
      return;
    } finally {
      readingFile.value = false;
    }
  } else {
    text = pastedText.value;
  }

  if (loadedText.value !== null && text === loadedText.value) {
    step.value = 2;
    return;
  }

  try {
    await load(text);
  } catch (err) {
    sourceError.value = err instanceof Error ? err.message : 'Could not read that source.';
    return;
  }
  loadedText.value = text;
  seedMappingDraft();
  step.value = 2;
}

// --- Step 2: field mapping -------------------------------------------------

const TARGET_OPTIONS: KtOption[] = [
  { id: 'ignore', label: 'Ignore' },
  { id: 'hanzi', label: 'Hanzi' },
  { id: 'pinyin', label: 'Pinyin' },
  { id: 'zhuyin', label: 'Zhuyin' },
  { id: 'translation', label: 'Translation' },
  { id: 'example', label: 'Example' },
  { id: 'examplePinyin', label: 'Example pinyin' },
  { id: 'exampleTranslation', label: 'Example translation' },
  { id: 'tags', label: 'Tags' },
];

const draftColumns = ref<Target[]>([]);
const draftHasHeader = ref(false);

function seedMappingDraft(): void {
  draftColumns.value = mapping.value ? [...mapping.value.columns] : [];
  draftHasHeader.value = mapping.value?.hasHeader ?? false;
}

function columnLabel(index: number): string {
  if (draftHasHeader.value) {
    const header = rows.value[0]?.[index]?.trim();
    if (header) return header;
  }
  return `Column ${index + 1}`;
}

function samplesFor(index: number): string[] {
  const dataRows = draftHasHeader.value ? rows.value.slice(1) : rows.value;
  return dataRows
    .slice(0, 2)
    .map((row) => row[index] ?? '')
    .filter((value) => value.length > 0);
}

function onColumnTargetChange(index: number, event: CustomEvent<{ value: string | number | null }>): void {
  const value = event.detail.value;
  const next = [...draftColumns.value];
  next[index] = (typeof value === 'string' ? value : 'ignore') as Target;
  draftColumns.value = next;
}

function onHasHeaderToggle(event: CustomEvent<{ checked: boolean }>): void {
  draftHasHeader.value = event.detail.checked;
}

const verifying = ref(false);

function backToStep1(): void {
  step.value = 1;
}

async function onContinueFromStep2(): Promise<void> {
  const built: Mapping = { columns: [...draftColumns.value], hasHeader: draftHasHeader.value };
  await setMapping(built);
  verifying.value = true;
  try {
    await verify();
  } finally {
    verifying.value = false;
  }
  step.value = 3;
}

function backToStep2(): void {
  step.value = 2;
}

// --- Step 3: review ----------------------------------------------------

type PreviewStatus = 'valid' | 'warning' | 'error' | 'duplicate';

interface PreviewRow {
  id: string;
  status: PreviewStatus;
  hanzi: string;
  pinyin: string;
  translation: string;
  issues: string;
}

function statusFor(row: ImportRow): PreviewStatus {
  if (!row.ok) return 'error';
  if (row.duplicate) return 'duplicate';
  return row.issues.some((issue) => issue.severity === 'warning') ? 'warning' : 'valid';
}

const previewRows = computed<PreviewRow[]>(() =>
  results.value.map((row, index) => ({
    id: String(index),
    status: statusFor(row),
    hanzi: row.draft.hanzi,
    pinyin: row.draft.pinyin,
    translation: row.draft.translation,
    issues: row.issues.map((issue) => issue.message).join('; '),
  })),
);

const previewColumns: KtTableColumn[] = [
  { key: 'status', label: 'Status', width: '110px' },
  { key: 'hanzi', label: 'Hanzi', width: '120px' },
  { key: 'pinyin', label: 'Pinyin', width: '160px' },
  { key: 'translation', label: 'Translation' },
  { key: 'issues', label: 'Issues' },
];

const STATUS_META: Record<PreviewStatus, { label: string; tone: 'success' | 'warning' | 'danger' | 'info' }> = {
  valid: { label: 'Valid', tone: 'success' },
  warning: { label: 'Warning', tone: 'warning' },
  error: { label: 'Error', tone: 'danger' },
  duplicate: { label: 'In deck', tone: 'info' },
};

/** `:renderCell` (camelCase) — see CardTable.vue's own comment: `render-cell` silently no-ops on kt-table's `attribute: false` property. */
function renderPreviewCell(row: KtTableRow, column: KtTableColumn): unknown {
  if (column.key === 'status') {
    const r = row as unknown as PreviewRow;
    const meta = STATUS_META[r.status];
    return html`<kt-badge variant="tag" tone="${meta.tone}" size="small">${meta.label}</kt-badge>`;
  }
  return undefined;
}

const DUPLICATE_OPTIONS: KtSegmentedOption[] = [
  { value: 'skip', label: 'Skip' },
  { value: 'update', label: 'Update' },
];
function onDuplicatePolicy(event: CustomEvent<{ value: string | number }>): void {
  duplicatePolicy.value = event.detail.value === 'update' ? 'update' : 'skip';
}
const canImport = computed(() => counts.value.valid > 0 || (counts.value.duplicates > 0 && duplicatePolicy.value === 'update'));

// --- Fix a row ---------------------------------------------------------

const editingIndex = ref<number | null>(null);
const editDraft = reactive<CardDraft>({ hanzi: '', pinyin: '', translation: '', example: '', examplePinyin: '', exampleTranslation: '' });
const EDIT_FIELDS: { key: keyof Omit<CardDraft, 'tags' | 'zhuyin'>; label: string }[] = [
  { key: 'hanzi', label: 'Hanzi' },
  { key: 'pinyin', label: 'Pinyin' },
  { key: 'translation', label: 'Translation' },
  { key: 'example', label: 'Example' },
  { key: 'examplePinyin', label: 'Example pinyin' },
  { key: 'exampleTranslation', label: 'Example translation' },
];
const editingIssues = computed(() => (editingIndex.value === null ? '' : results.value[editingIndex.value]?.issues.map((i) => i.message).join('; ') ?? ''));

/** Only rows with something to fix open the panel. */
function onRowClick(event: CustomEvent<{ row: KtTableRow }>): void {
  const index = Number((event.detail.row as unknown as PreviewRow).id);
  const row = results.value[index];
  if (!row || (row.ok && row.issues.length === 0)) return;
  Object.assign(editDraft, { example: '', examplePinyin: '', exampleTranslation: '', ...row.draft });
  editingIndex.value = index;
}

function onFixSave(): void {
  if (editingIndex.value === null) return;
  const original = results.value[editingIndex.value]!.draft;
  // A field the file did not map stays unmapped unless the learner typed something.
  const optional = (key: 'example' | 'examplePinyin' | 'exampleTranslation') =>
    original[key] === undefined && !editDraft[key] ? undefined : editDraft[key];
  fixRow(editingIndex.value, {
    ...original,
    hanzi: editDraft.hanzi,
    pinyin: editDraft.pinyin,
    translation: editDraft.translation,
    example: optional('example'),
    examplePinyin: optional('examplePinyin'),
    exampleTranslation: optional('exampleTranslation'),
  });
  editingIndex.value = null;
}

const importing = ref(false);

async function onImport(): Promise<void> {
  importing.value = true;
  try {
    const { heading, description } = importSummary(await commit(), duplicatePolicy.value);
    toaster.success(heading, description ? { description } : undefined);
    await navigateTo(`/decks/${targetDeckId.value}`);
  } catch (err) {
    console.error('import: commit failed', err);
    const createdSoFar = err instanceof ImportCommitError ? err.createdSoFar : 0;
    toaster.error("Couldn't finish the import", {
      description: createdSoFar > 0 ? `${plural(createdSoFar, 'card')} already created. Try again.` : 'Try again.',
    });
  } finally {
    importing.value = false;
  }
}

// --- Focus across steps -------------------------------------------------

type Focusable = HTMLElement & { updateComplete?: Promise<boolean> };
const sourceControl = ref<Focusable | null>(null);
const headerToggle = ref<Focusable | null>(null);
const reviewBack = ref<Focusable | null>(null);

/**
 * kt-segmented-control has no `focus()` of its own (kt-toggle and kt-button
 * delegate theirs to their inner `<button>`), so its tab stop — the
 * selected segment, found through its public `option` part — is focused
 * directly.
 */
function focusControl(el: Focusable): void {
  if (el.tagName === 'KT-SEGMENTED-CONTROL') {
    el.shadowRoot?.querySelector<HTMLElement>('[part="option"][tabindex="0"]')?.focus();
  } else {
    el.focus();
  }
}

/**
 * Each step swaps its whole `v-if` section out from under the button that
 * moved to it, so focus would fall to `<body>`. The new step's first
 * control takes it instead — once Lit has painted it, and only while focus
 * is still unclaimed.
 */
watch(
  step,
  async (now) => {
    const target = now === 1 ? sourceControl.value : now === 2 ? headerToggle.value : reviewBack.value;
    if (!target) return;
    await target.updateComplete;
    const active = document.activeElement;
    if (active && active !== document.body) return;
    focusControl(target);
  },
  { flush: 'post' },
);

// --- Header ------------------------------------------------------------

const stepDescription = computed(() => {
  if (step.value === 1) return 'Step 1 of 3 — Source';
  if (step.value === 2) return 'Step 2 of 3 — Field mapping';
  return 'Step 3 of 3 — Review';
});
</script>

<template>
  <div class="import">
    <kt-page-header eyebrow="Collection" heading="Import" :description="stepDescription" />
    <kt-steps label="Import steps" :steps="STEPS" :current="currentStepId" navigable @kt-change="onStepChange" />

    <kt-empty-state
      v-if="decksError"
      icon="triangle-alert"
      heading="Couldn't load your decks"
      description="Something went wrong reading the database. Try again."
    >
      <kt-button slot="actions" variant="secondary" size="medium" icon="refresh-cw" @click="initDecks">Retry</kt-button>
    </kt-empty-state>

    <section v-else-if="step === 1" class="step">
      <kt-segmented-control ref="sourceControl" label="Source" :options="SOURCE_OPTIONS" :value="source.mode" @kt-change="onSourceModeChange" />

      <!--
        No `recommended-size`: kt-drag-drop.ts hard-codes that hint's prefix
        as "Recommended image size: " (kt-drag-drop.md documents the prop
        for images specifically), which reads oddly for a CSV/TSV file —
        reported upstream, worked around here with a plain caption instead.
      -->
      <template v-if="source.mode === 'file'">
        <kt-drag-drop
          ref="dragDropEl"
          accept=".csv,.tsv,.txt"
          :multiple="false"
          :max-size="MAX_FILE_SIZE"
          @kt-files-change="onFilesChange"
          @kt-files-rejected="onFilesRejected"
        />
        <p class="source-hint">.csv, .tsv or .txt, up to 5 MB.</p>
      </template>
      <kt-textarea
        v-else
        label="Pasted rows"
        placeholder="Paste rows copied from a spreadsheet"
        rows="8"
        resize="vertical"
        :value="pastedText"
        @kt-input="onPastedInput"
      />

      <kt-select
        label="Destination deck"
        placeholder="Choose a deck"
        required
        :clearable="false"
        :disabled="decksLoading"
        :options="deckOptions"
        :value="targetDeckId"
        @kt-change="onDeckSelectChange"
      />

      <kt-alert v-if="sourceError" variant="danger" :description="sourceError" />

      <div class="actions">
        <kt-button variant="primary" size="medium" :disabled="!canContinueFromStep1 || readingFile" @click="onContinueFromStep1">Continue</kt-button>
      </div>
    </section>

    <section v-else-if="step === 2" class="step">
      <kt-alert v-if="mappingRemembered" variant="info" description="Mapping from your last import with these columns." />
      <kt-toggle ref="headerToggle" size="small" :checked="draftHasHeader" @kt-change="onHasHeaderToggle">First row is a header</kt-toggle>

      <div class="columns">
        <div v-for="(target, index) in draftColumns" :key="index" class="column-row">
          <div class="column-info">
            <span class="column-label">{{ columnLabel(index) }}</span>
            <span class="column-samples">{{ samplesFor(index).join(' · ') || '—' }}</span>
          </div>
          <kt-select
            class="column-target"
            :label="`Maps to, for ${columnLabel(index)}`"
            :clearable="false"
            :options="TARGET_OPTIONS"
            :value="target"
            @kt-change="onColumnTargetChange(index, $event)"
          />
        </div>
      </div>

      <div class="actions">
        <kt-button variant="dark" size="medium" @click="backToStep1">Back</kt-button>
        <kt-button variant="primary" size="medium" :disabled="verifying" @click="onContinueFromStep2">Continue</kt-button>
      </div>
    </section>

    <section v-else class="step">
      <div class="stats">
        <kt-stat label="Valid" :value="String(counts.valid)" />
        <kt-stat label="Warnings" :value="String(counts.warnings)" />
        <kt-stat label="Errors" :value="String(counts.errors)" />
        <kt-stat label="Already in deck" :value="String(counts.duplicates)" />
      </div>

      <kt-label-input v-if="counts.duplicates > 0" label="Cards already in the deck">
        <kt-segmented-control label="Cards already in the deck" :options="DUPLICATE_OPTIONS" :value="duplicatePolicy" @kt-change="onDuplicatePolicy" />
      </kt-label-input>

      <kt-alert
        v-if="counts.errors > 0"
        variant="warning"
        heading="Some rows won't be imported"
        :description="`${counts.errors} row${counts.errors === 1 ? '' : 's'} have an error and will be skipped. Valid rows can still be imported.`"
      />

      <kt-table
        label="Rows to import"
        :columns="previewColumns"
        :data="previewRows"
        :renderCell="renderPreviewCell"
        page-size="25"
        @kt-row-click="onRowClick"
      />

      <div class="actions">
        <kt-button ref="reviewBack" variant="dark" size="medium" :disabled="importing" @click="backToStep2">Back</kt-button>
        <kt-button variant="primary" size="medium" icon="upload" :disabled="!canImport || importing" @click="onImport">Import</kt-button>
      </div>
    </section>

    <kt-side-panel :open="editingIndex !== null" eyebrow="Fix row" :heading="editDraft.hanzi || 'Row'" @kt-close="editingIndex = null">
      <form class="fix-form" novalidate @submit.prevent="onFixSave">
        <kt-alert v-if="editingIssues" variant="warning" :description="editingIssues" />
        <kt-label-input v-for="field in EDIT_FIELDS" :key="field.key" :label="field.label">
          <kt-input :value="editDraft[field.key] ?? ''" @kt-input="(e: CustomEvent<{ value: string }>) => (editDraft[field.key] = e.detail.value)" />
        </kt-label-input>
      </form>
      <kt-button slot="footer" variant="primary" size="medium" @click="onFixSave">Check row</kt-button>
    </kt-side-panel>

    <DeckFormModal :open="deckFormOpen" @close="onDeckFormClose" @saved="onDeckFormSaved" />
  </div>
</template>

<style scoped>
.import { display: flex; flex-direction: column; gap: var(--gap-button); }
.step { display: flex; flex-direction: column; gap: var(--gap-button); }
.actions { display: flex; justify-content: flex-end; gap: var(--gap-element); }

.columns { display: flex; flex-direction: column; }
.column-row {
  display: grid;
  grid-template-columns: 1fr 220px;
  align-items: center;
  gap: var(--gap-element);
  padding: var(--gap-button) 0;
  border-bottom: var(--border-width) solid var(--border-subtle);
}
.column-info { display: flex; flex-direction: column; gap: 2px; min-width: 0; }
.column-label { font: var(--font-normal-medium); color: var(--text-body); }
.column-samples { font: var(--font-normal-small); color: var(--text-muted); overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.column-target { min-width: 0; }

@media (max-width: 560px) {
  .column-row { grid-template-columns: 1fr; }
}

.stats { display: grid; grid-template-columns: repeat(auto-fit, minmax(160px, 1fr)); gap: var(--gap-element); }

.fix-form { display: flex; flex-direction: column; gap: var(--gap-element); }
.source-hint { margin: 0; font: var(--font-normal-small); color: var(--text-muted); }
</style>
