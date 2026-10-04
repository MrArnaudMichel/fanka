<script setup lang="ts">
import type { KtTableColumn } from 'kanto-ds';
import arphicLicence from '../../public/strokes/ARPHICPL.TXT?raw';
import { DATA_SOURCES, LIBRARIES } from '~/utils/licences';

definePageMeta({ layout: 'legal' });
useHead({ title: 'Open source licences · Fanka' });

const columns: KtTableColumn[] = [
  { key: 'name', label: 'Library' },
  { key: 'licence', label: 'Licence' },
  { key: 'url', label: 'Website' },
];
const rows = LIBRARIES.map((l) => ({ ...l, id: l.package }));
</script>

<template>
  <kt-page-header eyebrow="Fanka" heading="Open source licences" description="Fanka is built on the work of these projects." />

  <section>
    <h2>Data</h2>
    <p v-for="d in DATA_SOURCES" :key="d.package">{{ d.name }} — {{ d.licence }} — {{ d.url }}</p>
    <kt-collapsible heading="Arphic Public License" plain>
      <pre class="licence-text">{{ arphicLicence }}</pre>
    </kt-collapsible>
  </section>

  <section>
    <h2>Libraries</h2>
    <kt-table label="Libraries" :columns="columns" :data="rows" compact />
  </section>
</template>

<style scoped>
.licence-text {
  white-space: pre-wrap;
  font: var(--font-normal-small);
  color: var(--text-muted);
  margin: 0;
}
</style>
