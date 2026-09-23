<script setup lang="ts">
import { computed, onMounted, ref } from 'vue';

interface ApkInfo {
  readonly exists: boolean;
  readonly size: number;
  readonly mtime: string | null;
  readonly urls: string[];
}

const loading = ref(true);
const loadError = ref(false);
const info = ref<ApkInfo | null>(null);

async function load(): Promise<void> {
  loading.value = true;
  loadError.value = false;
  try {
    info.value = await $fetch<ApkInfo>('/dev/install-info');
  } catch (err) {
    console.error('install: failed to load the APK info', err);
    loadError.value = true;
  } finally {
    loading.value = false;
  }
}

onMounted(load);

const primaryUrl = computed(() => info.value?.urls[0] ?? '');
const otherUrls = computed(() => info.value?.urls.slice(1) ?? []);

const sizeLabel = computed(() => {
  const bytes = info.value?.size ?? 0;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
});
const builtLabel = computed(() => {
  const mtime = info.value?.mtime;
  return mtime ? new Date(mtime).toLocaleString() : '';
});

const adbCommand = 'adb install -r android/app/build/outputs/apk/debug/app-debug.apk';

// Ties the `<img>` to this load: pressing Retry after building the APK
// changes `mtime`, which changes this URL, which makes the browser fetch
// the QR again instead of reusing whatever it cached for the bare `/dev/qr`.
const qrSrc = computed(() => `/dev/qr?t=${info.value?.mtime ?? ''}`);
</script>

<template>
  <div class="install">
    <kt-page-header
      eyebrow="Development"
      heading="Install on a phone"
      description="Scan the QR code, or open the link, to download and install the debug build."
    />

    <kt-skeleton v-if="loading" height="240px" />

    <kt-empty-state
      v-else-if="loadError || !info?.exists"
      icon="triangle-alert"
      heading="No debug APK yet"
      description="Run `npm run android` to build android/app/build/outputs/apk/debug/app-debug.apk, then reload this page."
    >
      <kt-button slot="actions" variant="secondary" size="medium" icon="refresh-cw" @click="load">Retry</kt-button>
    </kt-empty-state>

    <template v-else>
      <kt-card>
        <h2 slot="header">Scan to install</h2>
        <div class="qr-row">
          <img class="qr" :src="qrSrc" width="240" height="240" alt="QR code that downloads the Fanka debug APK" />
          <div class="details">
            <p class="field-label">Download URL</p>
            <kt-code label="Download URL">{{ primaryUrl }}</kt-code>
            <p v-if="otherUrls.length" class="also">Also reachable at: {{ otherUrls.join(', ') }}</p>
            <p class="meta">{{ sizeLabel }} &middot; built {{ builtLabel }}</p>
          </div>
        </div>
      </kt-card>

      <kt-card>
        <h2 slot="header">Install over USB instead</h2>
        <kt-code language="sh" copy>{{ adbCommand }}</kt-code>
        <p class="note">Android will ask you to allow installs from this source the first time.</p>
      </kt-card>
    </template>
  </div>
</template>

<style scoped>
.install {
  display: flex;
  flex-direction: column;
  gap: var(--gap-card);
}
h2 {
  font: var(--font-title-h6);
  color: var(--text-body);
}
.qr-row {
  display: flex;
  gap: 24px;
  flex-wrap: wrap;
  align-items: flex-start;
}
.qr {
  border-radius: var(--border-radius);
  background: var(--color-white);
  padding: 12px;
  flex: 0 0 auto;
}
.details {
  display: flex;
  flex-direction: column;
  gap: 8px;
  min-width: 240px;
  flex: 1;
}
.field-label {
  font: var(--font-normal-small);
  color: var(--text-muted);
  margin: 0;
}
.also,
.meta,
.note {
  font: var(--font-normal-small);
  color: var(--text-muted);
}
.note {
  margin: 0;
}
</style>
