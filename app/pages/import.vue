<script setup lang="ts">
import type { KtOption, KtSegmentedOption, KtTableColumn, KtTableRow } from 'kanto';
import { toaster } from 'kanto';
import { html } from 'lit';
import DeckFormModal from '~/components/DeckFormModal.vue';
import { ImportCommitError, useImport } from '~/composables/useImport';
import type { Mapping, Target } from '~core/import/mapping';
import type { Validated } from '~core/import/validate';

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
    load(text);
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
  setMapping(built);
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

type PreviewStatus = 'valid' | 'warning' | 'error';

interface PreviewRow {
  id: string;
  status: PreviewStatus;
  hanzi: string;
  pinyin: string;
  translation: string;
  issues: string;
}

function statusFor(row: Validated): PreviewStatus {
  if (!row.ok) return 'error';
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

const STATUS_META: Record<PreviewStatus, { label: string; tone: 'success' | 'warning' | 'danger' }> = {
  valid: { label: 'Valid', tone: 'success' },
  warning: { label: 'Warning', tone: 'warning' },
  error: { label: 'Error', tone: 'danger' },
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

const importing = ref(false);

async function onImport(): Promise<void> {
  importing.value = true;
  try {
    const { created, skipped } = await commit();
    toaster.success(
      `Imported ${created} card${created === 1 ? '' : 's'}`,
      skipped > 0 ? { description: `${skipped} duplicate${skipped === 1 ? '' : 's'} skipped` } : undefined,
    );
    await navigateTo(`/decks/${targetDeckId.value}`);
  } catch (err) {
    console.error('import: commit failed', err);
    const createdSoFar = err instanceof ImportCommitError ? err.createdSoFar : 0;
    toaster.error("Couldn't finish the import", {
      description: createdSoFar > 0 ? `${createdSoFar} card${createdSoFar === 1 ? '' : 's'} were already created. Try again.` : 'Try again.',
    });
  } finally {
    importing.value = false;
  }
}

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
    <!-- Kanto has no stepper (task-14-brief.md) — a progress bar under the header is what stands in for one. -->
    <kt-progress-bar :value="step" :max="3" label="Import progress" />

    <kt-empty-state
      v-if="decksError"
      icon="triangle-alert"
      heading="Couldn't load your decks"
      description="Something went wrong reading the database. Try again."
    >
      <kt-button slot="actions" variant="secondary" size="medium" icon="refresh-cw" @click="initDecks">Retry</kt-button>
    </kt-empty-state>

    <section v-else-if="step === 1" class="step">
      <kt-segmented-control label="Source" :options="SOURCE_OPTIONS" :value="source.mode" @kt-change="onSourceModeChange" />

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
      <kt-toggle :checked="draftHasHeader" label="First row is a header" @kt-change="onHasHeaderToggle" />

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
      </div>

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
      />

      <div class="actions">
        <kt-button variant="dark" size="medium" :disabled="importing" @click="backToStep2">Back</kt-button>
        <kt-button variant="primary" size="medium" icon="upload" :disabled="counts.valid === 0 || importing" @click="onImport">Import</kt-button>
      </div>
    </section>

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

.source-hint { margin: 0; font: var(--font-normal-small); color: var(--text-muted); }
</style>
