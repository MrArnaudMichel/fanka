<script setup lang="ts">
import { useAppInfo } from '~/composables/useAppInfo';
import { useCompactLayout } from '~/composables/useCompactLayout';
import { formatBytes } from '~/utils/format';

const { compact } = useCompactLayout();
const { version, commit, builtAt, platform, storage, loadStorage } = useAppInfo();
onMounted(loadStorage);
const builtLabel = builtAt ? new Date(builtAt).toLocaleString() : 'Unknown';
</script>

<template>
  <kt-page-header eyebrow="Settings" heading="About" description="Which build this is and where it runs.">
    <kt-button v-if="compact" slot="actions" variant="secondary-no-bg" size="medium" icon="chevron-left" @click="navigateTo('/settings', { replace: true })">Settings</kt-button>
  </kt-page-header>
  <kt-card>
    <dl class="facts">
      <dt>Version</dt><dd>{{ version }}<template v-if="commit"> ({{ commit }})</template></dd>
      <dt>Built</dt><dd>{{ builtLabel }}</dd>
      <dt>Platform</dt><dd>{{ platform }}</dd>
      <template v-if="storage">
        <dt>Storage used</dt><dd>{{ formatBytes(storage.usage) }} of {{ formatBytes(storage.quota) }}</dd>
      </template>
    </dl>
  </kt-card>
</template>

<style scoped>
.facts { display: grid; grid-template-columns: max-content 1fr; gap: var(--gap-element) var(--gap-card); margin: 0; }
.facts dt { color: var(--text-muted); font: var(--font-normal-regular); }
.facts dd { margin: 0; color: var(--text-body); font: var(--font-normal-medium); }
</style>
