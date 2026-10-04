<script setup lang="ts">
import type { KtTableColumn, KtTableRow } from 'kanto-ds';
import { html } from 'lit';
import arphicLicence from '../../public/strokes/ARPHICPL.TXT?raw';
import { DATA_SOURCES, LIBRARIES } from '~/utils/licences';

definePageMeta({ layout: 'legal' });
useHead({ title: 'Open source licences · Fanka' });

const columns: KtTableColumn[] = [
  { key: 'name', label: 'Library' },
  { key: 'licence', label: 'Licence', align: 'right' },
];
const rows = LIBRARIES.map((l) => ({ ...l, id: l.package }));

function renderCell(row: KtTableRow, column: KtTableColumn): unknown {
  if (column.key !== 'licence') return undefined;
  return html`<kt-badge variant="code" size="small" style="white-space: nowrap">${row.licence}</kt-badge>`;
}

function openProject(event: CustomEvent<{ row: KtTableRow }>): void {
  window.open(String(event.detail.row.url), '_blank', 'noopener');
}
</script>

<template>
  <kt-page-header eyebrow="Legal" heading="Open source licences" description="Fanka is built on the work of these projects. Thank you." />

  <LegalSection icon="file-text" heading="Data">
    <div class="sources">
      <div v-for="d in DATA_SOURCES" :key="d.package" class="source">
        <span class="source-name">{{ d.name }}</span>
        <kt-badge variant="code" size="small">{{ d.licence }}</kt-badge>
        <span class="source-url">{{ d.url }}</span>
      </div>
    </div>
    <kt-collapsible heading="Arphic Public License" plain>
      <pre class="licence-text">{{ arphicLicence }}</pre>
    </kt-collapsible>
  </LegalSection>

  <LegalSection icon="layers" heading="Libraries">
    <p>Select a library to open its website.</p>
    <kt-table label="Libraries" :columns="columns" :data="rows" :renderCell="renderCell" compact @kt-row-click="openProject" />
  </LegalSection>
</template>

<style scoped>
.sources { display: flex; flex-direction: column; gap: var(--gap-element); }
.source { display: flex; flex-wrap: wrap; align-items: center; gap: var(--gap-button); }
.source-name { font: var(--font-normal-medium); color: var(--text-body); }
.source-url { flex-basis: 100%; font: var(--font-normal-small); color: var(--text-muted); }
.licence-text { white-space: pre-wrap; font: var(--font-normal-small); color: var(--text-muted); margin: 0; }
</style>
