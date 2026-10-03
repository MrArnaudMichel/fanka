<script setup lang="ts">
import { useAppInfo } from '~/composables/useAppInfo';
import { formatBytes } from '~/utils/format';

const { version, commit, builtAt, platform, storage, loadStorage } = useAppInfo();
onMounted(loadStorage);
const builtLabel = builtAt ? new Date(builtAt).toLocaleString() : 'Unknown';
</script>

<template>
  <SettingsHeader heading="About" description="Which build this is and where it runs." />
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
