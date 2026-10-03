<script setup lang="ts">
import { toaster } from 'kanto-ds';
import type { Backup } from '~core/backup/format';
import { useAuth } from '~/composables/useAuth';
import { useBackup } from '~/composables/useBackup';
import { useCompactLayout } from '~/composables/useCompactLayout';

const { compact } = useCompactLayout();
const { user } = useAuth();
const { exportBackup, readFile, restore, reset } = useBackup();

const exporting = ref(false);
const pending = ref<Backup | null>(null);
const restoreError = ref('');
const confirmRestore = ref(false);
const confirmReset = ref(false);
const dropEl = ref<(HTMLElement & { selectedFiles: readonly File[] }) | null>(null);

async function onExport(): Promise<void> {
  exporting.value = true;
  try {
    await exportBackup();
  } catch (err) {
    console.error('data: export failed', err);
    toaster.error("Couldn't export a backup", { description: 'Try again.' });
  } finally {
    exporting.value = false;
  }
}

async function onFile(): Promise<void> {
  restoreError.value = '';
  pending.value = null;
  const file = dropEl.value?.selectedFiles[0];
  if (!file) return;
  const parsed = await readFile(file);
  if (parsed.ok) pending.value = parsed.backup;
  else restoreError.value = parsed.error;
}

const summary = computed(() => {
  const b = pending.value;
  if (!b) return '';
  return `${b.decks.length} decks, ${b.cards.length} cards and ${b.reviews.length} reviews, exported ${new Date(b.exportedAt).toLocaleString()}.`;
});

async function onConfirmRestore(): Promise<void> {
  confirmRestore.value = false;
  if (!pending.value) return;
  try {
    await restore(pending.value);
  } catch (err) {
    console.error('data: restore failed', err);
    toaster.error("Couldn't restore the backup", { description: 'Nothing was changed. Try again.' });
  }
}

async function onConfirmReset(): Promise<void> {
  confirmReset.value = false;
  try {
    await reset();
  } catch (err) {
    console.error('data: reset failed', err);
    toaster.error("Couldn't reset this device", { description: 'Try again.' });
  }
}
</script>

<template>
  <kt-page-header eyebrow="Settings" heading="Data" description="Back up your collection, restore it, or start this device over.">
    <kt-button v-if="compact" slot="actions" variant="secondary-no-bg" size="medium" icon="chevron-left" @click="navigateTo('/settings')">Settings</kt-button>
  </kt-page-header>

  <kt-form heading="Export" description="Every deck, card, review and setting in one JSON file.">
    <kt-button slot="footer" variant="primary" size="medium" icon="download" :disabled="exporting" @click="onExport">Export backup</kt-button>
  </kt-form>

  <kt-form heading="Restore" description="Adds what the backup has and this device doesn't. Newer changes here are kept.">
    <kt-drag-drop ref="dropEl" accept=".json,application/json" :multiple="false" @kt-files-change="onFile" />
    <kt-alert v-if="restoreError" variant="danger" :description="restoreError" />
    <kt-alert v-if="pending" variant="info" heading="Ready to restore" :description="summary" />
    <kt-button slot="footer" variant="primary" size="medium" :disabled="!pending" @click="confirmRestore = true">Restore</kt-button>
  </kt-form>

  <kt-form heading="Reset this device" :description="user ? 'Clears everything stored here. Your account keeps its copy, and the next sync brings it back.' : 'Clears everything stored here. Without an account or a backup, this cannot be undone.'">
    <kt-button slot="footer" variant="danger" size="medium" @click="confirmReset = true">Reset this device</kt-button>
  </kt-form>

  <kt-confirm-dialog
    :open="confirmRestore"
    heading="Restore this backup?"
    :message="summary"
    confirm-label="Restore"
    variant="primary"
    @kt-confirm="onConfirmRestore"
    @kt-cancel="confirmRestore = false"
  />
  <kt-confirm-dialog
    :open="confirmReset"
    heading="Reset this device?"
    :message="user ? 'Everything here is cleared, then synced back from your account.' : 'Every deck, card and review on this device is deleted.'"
    confirm-label="Reset"
    variant="danger"
    @kt-confirm="onConfirmReset"
    @kt-cancel="confirmReset = false"
  />
</template>
