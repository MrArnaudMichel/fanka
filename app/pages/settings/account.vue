<script setup lang="ts">
import { toaster } from 'kanto-ds';
import { useAuth } from '~/composables/useAuth';
import { useSync } from '~/composables/useSync';
import { timeAgo } from '~/utils/format';

const { user, error, displayName, signOut, updateProfile, deleteAccount, deleting } = useAuth();
const { status, lastSyncedAt, error: syncError, details, syncNow, refreshDetails } = useSync();
onMounted(refreshDetails);

type Tone = 'neutral' | 'success' | 'info' | 'warning' | 'danger';
const STATUS: Record<string, { label: string; tone: Tone }> = {
  idle: { label: 'Up to date', tone: 'success' },
  syncing: { label: 'Syncing', tone: 'info' },
  offline: { label: 'Offline', tone: 'warning' },
  error: { label: 'Error', tone: 'danger' },
};
const statusMeta = computed<{ label: string; tone: Tone }>(() => {
  if (status.value !== 'idle') return STATUS[status.value]!;
  if ((details.value?.pending ?? 0) > 0) return { label: 'Waiting to sync', tone: 'info' };
  if (lastSyncedAt.value === null) return { label: 'Not synced yet', tone: 'neutral' };
  return STATUS.idle!;
});

// The relative label ("3 min ago") has to move on while the page stays open.
// Behaviour, not a styling token: how often the label is recomputed.
const RELATIVE_TICK_MS = 30_000;
const now = ref(Date.now());
let tick: ReturnType<typeof setInterval> | undefined;
onMounted(() => (tick = setInterval(() => (now.value = Date.now()), RELATIVE_TICK_MS)));
onBeforeUnmount(() => clearInterval(tick));
const lastSyncedLabel = computed(() => (lastSyncedAt.value ? `Last synced ${timeAgo(lastSyncedAt.value, now.value)}` : 'Not synced on this device yet'));
const lastSyncedExact = computed(() => (lastSyncedAt.value ? new Date(lastSyncedAt.value).toLocaleString() : ''));

const nameDraft = ref('');
const savingName = ref(false);
watch(displayName, (name) => (nameDraft.value = name), { immediate: true });

async function onSaveName(): Promise<void> {
  savingName.value = true;
  const ok = await updateProfile(nameDraft.value);
  savingName.value = false;
  if (ok) toaster.success('Profile saved');
  else toaster.error("Couldn't save your profile", { description: error.value || 'Try again.' });
}

const confirmingDelete = ref(false);
/** Deleting needs the server; offline the button is disabled with a hint. */
const online = ref(typeof navigator === 'undefined' || navigator.onLine);
function updateOnline(): void {
  online.value = navigator.onLine;
}
onMounted(() => {
  window.addEventListener('online', updateOnline);
  window.addEventListener('offline', updateOnline);
});
onBeforeUnmount(() => {
  window.removeEventListener('online', updateOnline);
  window.removeEventListener('offline', updateOnline);
});

async function onDeleteAccount(): Promise<void> {
  confirmingDelete.value = false;
  if (await deleteAccount()) {
    toaster.success('Account deleted');
  } else if (error.value) {
    toaster.error("Couldn't delete your account", { description: error.value });
  }
}
</script>

<template>
  <SettingsHeader heading="Account" description="Your profile and how this device syncs." />

  <SignInForm v-if="!user" />

  <template v-else>
    <form novalidate @submit.prevent="onSaveName">
      <kt-form heading="Profile" description="Signing out keeps everything on this device.">
        <div class="identity">
          <kt-avatar size="large" :name="displayName" />
          <div class="identity-text">
            <span class="identity-name">{{ displayName }}</span>
            <span class="identity-email">{{ user.email }}</span>
          </div>
        </div>
        <kt-label-input label="Display name">
          <kt-input name="display-name" autocomplete="nickname" :value="nameDraft" @kt-input="(e: CustomEvent<{ value: string }>) => (nameDraft = e.detail.value)" />
        </kt-label-input>
        <kt-button slot="footer" type="button" variant="dark" size="medium" icon="log-out" @click="signOut">Sign out</kt-button>
        <kt-button slot="footer" type="submit" variant="primary" size="medium" :disabled="savingName || nameDraft.trim() === displayName">Save</kt-button>
      </kt-form>
    </form>

    <kt-form heading="Sync">
      <div class="sync-head">
        <kt-badge variant="tag" :tone="statusMeta.tone" size="small">{{ statusMeta.label }}</kt-badge>
        <span class="muted" :title="lastSyncedExact">{{ lastSyncedLabel }}</span>
      </div>
      <div v-if="details" class="sync-stats">
        <kt-stat label="Decks" :value="String(details.decks)" />
        <kt-stat label="Cards" :value="String(details.cards)" />
        <kt-stat label="Reviews" :value="String(details.reviews)" />
        <kt-stat label="Waiting to send" :value="String(details.pending)" />
      </div>
      <kt-alert v-if="status === 'error'" variant="danger" :description="syncError || 'Sync failed. It will retry automatically.'" />
      <kt-alert v-if="status === 'offline'" variant="warning" description="No connection. Changes are saved here and sync once you're back online." />
      <kt-button slot="footer" variant="secondary" size="medium" icon="refresh-cw" :disabled="status === 'syncing'" @click="syncNow">Sync now</kt-button>
    </kt-form>

    <kt-form heading="Delete account" description="Deletes your account and everything synced to it. The decks and cards on this device stay.">
      <kt-alert v-if="!online" variant="warning" description="Connect to the internet to delete your account." />
      <kt-button slot="footer" type="button" variant="danger" size="medium" icon="trash-2" :disabled="deleting || !online" @click="confirmingDelete = true">Delete account</kt-button>
    </kt-form>
    <kt-confirm-dialog
      :open="confirmingDelete"
      heading="Delete your account?"
      message="Your account and everything synced to it are deleted. The decks and cards on this device stay."
      confirm-label="Delete account"
      cancel-label="Cancel"
      variant="danger"
      @kt-confirm="onDeleteAccount"
      @kt-cancel="confirmingDelete = false"
    />
  </template>
</template>

<style scoped>
form { display: flex; flex-direction: column; }
.identity { display: flex; align-items: center; gap: var(--gap-element); }
.identity-text { display: flex; flex-direction: column; min-width: 0; }
.identity-name { font: var(--font-normal-medium); color: var(--text-body); }
.identity-email { font: var(--font-normal-small); color: var(--text-muted); overflow: hidden; text-overflow: ellipsis; }
.sync-head { display: flex; align-items: center; gap: var(--gap-element); flex-wrap: wrap; }
.muted { color: var(--text-muted); font: var(--font-normal-small); }
.sync-stats { display: grid; grid-template-columns: repeat(auto-fit, minmax(120px, 1fr)); gap: var(--gap-element); }
</style>
