<script setup lang="ts">
import { toaster } from 'kanto-ds';
import { useAuth } from '~/composables/useAuth';
import { useCompactLayout } from '~/composables/useCompactLayout';
import { useSync } from '~/composables/useSync';

const { compact } = useCompactLayout();
const { user, loading, error, displayName, signIn, signOut, updateProfile } = useAuth();
const { status, lastSyncedAt, error: syncError, details, syncNow, refreshDetails } = useSync();
onMounted(refreshDetails);

const STATUS: Record<string, { label: string; tone: 'success' | 'info' | 'warning' | 'danger' }> = {
  idle: { label: 'Up to date', tone: 'success' },
  syncing: { label: 'Syncing', tone: 'info' },
  offline: { label: 'Offline', tone: 'warning' },
  error: { label: 'Error', tone: 'danger' },
};
const statusMeta = computed(() => (status.value === 'idle' && (details.value?.pending ?? 0) > 0 ? { label: 'Waiting to sync', tone: 'info' as const } : STATUS[status.value]!));
const lastSyncedLabel = computed(() => (lastSyncedAt.value ? new Date(lastSyncedAt.value).toLocaleString() : 'Not yet on this device'));

const email = ref('');
const linkSent = ref(false);
const nameDraft = ref('');
const savingName = ref(false);
watch(displayName, (name) => (nameDraft.value = name), { immediate: true });

async function onSendLink(): Promise<void> {
  linkSent.value = false;
  await signIn(email.value);
  if (!error.value) linkSent.value = true;
}

async function onSaveName(): Promise<void> {
  savingName.value = true;
  const ok = await updateProfile(nameDraft.value);
  savingName.value = false;
  if (ok) toaster.success('Profile saved');
  else toaster.error("Couldn't save your profile", { description: error.value || 'Try again.' });
}

async function onSignOut(): Promise<void> {
  await signOut();
  linkSent.value = false;
  email.value = '';
}
</script>

<template>
  <kt-page-header eyebrow="Settings" heading="Account" description="Your profile and how this device syncs.">
    <kt-button v-if="compact" slot="actions" variant="secondary-no-bg" size="medium" icon="chevron-left" @click="navigateTo('/settings', { replace: true })">Settings</kt-button>
  </kt-page-header>

  <form v-if="!user" novalidate @submit.prevent="onSendLink">
    <kt-form heading="Sign in" description="An account syncs your decks and progress across devices. Fanka works fully offline without one.">
      <kt-label-input label="Email">
        <kt-input type="email" name="email" autocomplete="email" placeholder="you@example.com" :value="email" :error="error"
          @kt-input="(e: CustomEvent<{ value: string }>) => { email = e.detail.value; linkSent = false; }" />
      </kt-label-input>
      <kt-alert v-if="linkSent && !error" variant="success" description="Check your inbox for the sign-in link." />
      <kt-button slot="footer" type="submit" variant="primary" size="medium" :disabled="loading || !email">Send link</kt-button>
    </kt-form>
  </form>

  <template v-else>
    <form novalidate @submit.prevent="onSaveName">
      <kt-form heading="Profile">
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
        <kt-button slot="footer" type="submit" variant="primary" size="medium" :disabled="savingName || nameDraft.trim() === displayName">Save</kt-button>
      </kt-form>
    </form>

    <kt-form heading="Sync">
      <div class="sync-head">
        <kt-badge variant="tag" :tone="statusMeta.tone" size="small">{{ statusMeta.label }}</kt-badge>
        <span class="muted">Last synced {{ lastSyncedLabel }}</span>
      </div>
      <div v-if="details" class="sync-stats">
        <kt-stat label="Waiting to send" :value="String(details.pending)" />
        <kt-stat label="Decks" :value="String(details.decks)" />
        <kt-stat label="Cards" :value="String(details.cards)" />
        <kt-stat label="Reviews" :value="String(details.reviews)" />
      </div>
      <kt-alert v-if="status === 'error'" variant="danger" :description="syncError || 'Sync failed. It will retry automatically.'" />
      <kt-alert v-if="status === 'offline'" variant="warning" description="No connection. Changes are saved here and sync once you're back online." />
      <kt-button slot="footer" variant="secondary" size="medium" icon="refresh-cw" :disabled="status === 'syncing'" @click="syncNow">Sync now</kt-button>
    </kt-form>

    <kt-form heading="Session" description="Signing out keeps everything on this device.">
      <kt-button slot="footer" variant="dark" size="medium" icon="log-out" @click="onSignOut">Sign out</kt-button>
    </kt-form>
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
