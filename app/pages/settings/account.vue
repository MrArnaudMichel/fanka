<script setup lang="ts">
import { computed, ref } from 'vue';
import { useAuth } from '~/composables/useAuth';
import { useCompactLayout } from '~/composables/useCompactLayout';
import { useSync } from '~/composables/useSync';

const { compact } = useCompactLayout();

const { user: authUser, loading: authLoading, error: authError, signIn, signOut } = useAuth();
const { status: syncStatus, lastSyncedAt, error: syncError, syncNow } = useSync();

const email = ref('');
const linkSent = ref(false);
const syncing = computed(() => syncStatus.value === 'syncing');

function onEmailInput(event: CustomEvent<{ value: string }>): void {
  email.value = event.detail.value;
  linkSent.value = false;
}

async function onSendLink(): Promise<void> {
  linkSent.value = false;
  await signIn(email.value);
  if (!authError.value) linkSent.value = true;
}

async function onSignOut(): Promise<void> {
  await signOut();
  linkSent.value = false;
  email.value = '';
}

async function onSyncNow(): Promise<void> {
  await syncNow();
}

const lastSyncedLabel = computed(() => (lastSyncedAt.value ? new Date(lastSyncedAt.value).toLocaleString() : 'Never'));
</script>

<template>
  <kt-page-header eyebrow="Settings" heading="Account">
    <kt-button v-if="compact" slot="actions" variant="secondary-no-bg" size="medium" icon="chevron-left" @click="navigateTo('/settings')">Settings</kt-button>
  </kt-page-header>
  <form novalidate @submit.prevent="onSendLink">
    <kt-form heading="Account" description="Sign in with a magic link to sync your decks and progress across devices. Fanka works fully offline either way.">
      <kt-label-input v-show="!authUser" label="Email">
        <kt-input
          type="email"
          name="email"
          autocomplete="email"
          placeholder="you@example.com"
          :value="email"
          :error="authError"
          @kt-input="onEmailInput"
        />
      </kt-label-input>
      <kt-alert v-show="!authUser && linkSent && !authError" variant="success" description="Check your inbox for the sign-in link." />

      <div v-show="!!authUser" class="account-status">
        <p>Signed in as {{ authUser?.email }}</p>
        <p class="muted">Last synced: {{ lastSyncedLabel }}<template v-if="syncing"> · Syncing…</template></p>
        <kt-alert v-if="syncStatus === 'error'" variant="danger" :description="syncError || 'Sync failed. It will retry automatically.'" />
        <kt-alert v-if="syncStatus === 'offline'" variant="warning" description="No connection. Changes are saved locally and will sync once you're back online." />
      </div>

      <kt-button slot="footer" v-show="!authUser" type="submit" variant="primary" size="medium" :disabled="authLoading || !email">
        Send link
      </kt-button>
      <kt-button slot="footer" v-show="!!authUser" type="button" variant="secondary" size="medium" :disabled="syncing" @click="onSyncNow">
        Sync now
      </kt-button>
      <kt-button slot="footer" v-show="!!authUser" type="button" variant="dark" size="medium" @click="onSignOut">Sign out</kt-button>
    </kt-form>
  </form>
</template>

<style scoped>
.account-status { display: flex; flex-direction: column; gap: var(--gap-element); }
.account-status p { margin: 0; color: var(--text-body); font: var(--font-normal-regular); }
.account-status .muted { color: var(--text-muted); }
</style>
