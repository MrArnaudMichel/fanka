<script setup lang="ts">
import type { KtDescriptionItem } from 'kanto-ds';
import { useAppInfo } from '~/composables/useAppInfo';
import { formatBytes } from '~/utils/format';

const { version, commit, builtAt, platform, storage, loadStorage } = useAppInfo();
onMounted(loadStorage);
const builtLabel = builtAt ? new Date(builtAt).toLocaleString() : 'Unknown';

const facts = computed<KtDescriptionItem[]>(() => [
  { term: 'Version', detail: commit ? `${version} (${commit})` : version },
  { term: 'Built', detail: builtLabel },
  { term: 'Platform', detail: platform },
  ...(storage.value ? [{ term: 'Storage used', detail: `${formatBytes(storage.value.usage)} of ${formatBytes(storage.value.quota)}` }] : []),
]);
</script>

<template>
  <SettingsHeader heading="About" description="Which build this is and where it runs." />
  <kt-card>
    <!-- `items` is an array, so it goes in as a property. -->
    <kt-description-list label="Build" :items="facts" />
  </kt-card>
  <kt-card>
    <div class="links">
      <kt-button variant="secondary-no-bg" size="small" icon="shield" @click="navigateTo('/privacy')">Privacy policy</kt-button>
      <kt-button variant="secondary-no-bg" size="small" icon="user-x" @click="navigateTo('/delete-account')">Delete your account</kt-button>
      <kt-button variant="secondary-no-bg" size="small" icon="scale" @click="navigateTo('/licences')">Open source licences</kt-button>
    </div>
  </kt-card>
</template>

<style scoped>
.links { display: flex; flex-wrap: wrap; gap: var(--gap-element); }
</style>
