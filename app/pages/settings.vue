<script setup lang="ts">
import { toaster } from 'kanto-ds';
import type { KtOption } from 'kanto-ds';
import { computed, reactive, ref, watch } from 'vue';
import { useAuth } from '~/composables/useAuth';
import { useCompactLayout } from '~/composables/useCompactLayout';
import { useReminder } from '~/composables/useReminder';
import { useSettings } from '~/composables/useSettings';
import { useSync } from '~/composables/useSync';
import type { Algorithm } from '~core/srs';

const { settings, ready, update } = useSettings();
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

const algorithm = ref<Algorithm>('FSRS');
const newPerDay = ref(0);
const desiredRetention = ref(0);
const maxInterval = ref(0);
const theme = ref<'dark' | 'light' | 'auto'>('dark');
const hanziFont = ref<'serif' | 'sans'>('serif');
const showZhuyin = ref(false);
const toneColors = ref(true);
const hidePinyinUntilRevealed = ref(false);
const strokeFeedback = ref(true);
const autoPlayAudio = ref(false);

const reminderEnabled = ref(false);
const reminderTime = ref('19:00');
const reminderDenied = ref(false);
const { native: reminderAvailable, requestPermission } = useReminder();

async function onReminderToggle(event: CustomEvent<{ checked: boolean }>): Promise<void> {
  reminderEnabled.value = event.detail.checked;
  reminderDenied.value = false;
  if (!event.detail.checked) return;
  if (!(await requestPermission())) {
    reminderEnabled.value = false;
    reminderDenied.value = true;
  }
}

function onReminderTimeChange(event: CustomEvent<{ value: string }>): void {
  if (event.detail.value) reminderTime.value = event.detail.value;
}

const saving = ref(false);

/**
 * Local form state, seeded from the loaded record and never re-synced while
 * the form is open — a background `update()` from another tab/page must not
 * overwrite what the learner is mid-way through typing here. Re-seeds once,
 * the instant `ready` flips true (Dexie's read resolves after this page has
 * already mounted with the module's still-default snapshot).
 */
watch(
  ready,
  (isReady) => {
    if (!isReady) return;
    algorithm.value = settings.value.algorithm;
    newPerDay.value = settings.value.newPerDay;
    desiredRetention.value = settings.value.desiredRetention;
    maxInterval.value = settings.value.maxInterval;
    theme.value = settings.value.theme;
    hanziFont.value = settings.value.hanziFont;
    showZhuyin.value = settings.value.showZhuyin;
    toneColors.value = settings.value.toneColors;
    hidePinyinUntilRevealed.value = settings.value.hidePinyinUntilRevealed;
    strokeFeedback.value = settings.value.strokeFeedback;
    autoPlayAudio.value = settings.value.autoPlayAudio;
    reminderEnabled.value = settings.value.reminderEnabled;
    reminderTime.value = settings.value.reminderTime;
  },
  { immediate: true },
);

const algorithmOptions: KtOption[] = [
  { id: 'FSRS', label: 'FSRS' },
  { id: 'SM-2', label: 'SM-2' },
];
const themeOptions: KtOption[] = [
  { id: 'auto', label: 'System' },
  { id: 'light', label: 'Light' },
  { id: 'dark', label: 'Dark' },
];
const hanziFontOptions: KtOption[] = [
  { id: 'serif', label: 'Serif' },
  { id: 'sans', label: 'Sans' },
];

const errors = reactive<{ newPerDay: string; desiredRetention: string; maxInterval: string }>({
  newPerDay: '',
  desiredRetention: '',
  maxInterval: '',
});

function validate(): boolean {
  errors.newPerDay = Number.isInteger(newPerDay.value) && newPerDay.value >= 0 ? '' : 'Enter a whole number, 0 or more.';
  errors.desiredRetention =
    Number.isFinite(desiredRetention.value) && desiredRetention.value > 0 && desiredRetention.value <= 1
      ? ''
      : 'Enter a number between 0 and 1.';
  errors.maxInterval = Number.isInteger(maxInterval.value) && maxInterval.value >= 1 ? '' : 'Enter a whole number, 1 or more.';
  return !errors.newPerDay && !errors.desiredRetention && !errors.maxInterval;
}

async function onSave(): Promise<void> {
  if (!validate()) return;
  saving.value = true;
  try {
    await update({
      algorithm: algorithm.value,
      newPerDay: newPerDay.value,
      desiredRetention: desiredRetention.value,
      maxInterval: maxInterval.value,
      theme: theme.value,
      hanziFont: hanziFont.value,
      showZhuyin: showZhuyin.value,
      toneColors: toneColors.value,
      hidePinyinUntilRevealed: hidePinyinUntilRevealed.value,
      strokeFeedback: strokeFeedback.value,
      autoPlayAudio: autoPlayAudio.value,
      reminderEnabled: reminderEnabled.value,
      reminderTime: reminderTime.value,
    });
    toaster.success('Settings saved');
  } catch (err) {
    console.error('settings: failed to save', err);
    toaster.error("Couldn't save settings", { description: 'Try again.' });
  } finally {
    saving.value = false;
  }
}

function onNewPerDayChange(event: CustomEvent<{ value: string }>): void {
  newPerDay.value = Number(event.detail.value);
}
function onDesiredRetentionChange(event: CustomEvent<{ value: string }>): void {
  desiredRetention.value = Number(event.detail.value);
}
function onMaxIntervalChange(event: CustomEvent<{ value: string }>): void {
  maxInterval.value = Number(event.detail.value);
}

const loading = computed(() => !ready.value);
</script>

<template>
  <div class="settings">
    <kt-page-header eyebrow="Preferences" heading="Settings" description="How new cards are introduced, scheduled and shown." />

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

    <form novalidate @submit.prevent="onSave">
      <kt-form heading="Scheduler" description="Daily allowance and the algorithm behind due dates." :loading="loading" loading-fields="3">
        <kt-label-input label="Scheduler algorithm">
          <kt-select
            :options="algorithmOptions"
            :value="algorithm"
            :clearable="false"
            @kt-change="(e: CustomEvent) => (algorithm = e.detail.value)"
          />
        </kt-label-input>
        <kt-label-input label="New cards per day">
          <kt-input
            type="number"
            :value="String(newPerDay)"
            :error="errors.newPerDay"
            @kt-change="onNewPerDayChange"
          />
        </kt-label-input>
        <kt-label-input label="Desired retention (0–1)">
          <kt-input
            type="number"
            :value="String(desiredRetention)"
            :error="errors.desiredRetention"
            @kt-change="onDesiredRetentionChange"
          />
        </kt-label-input>
        <kt-label-input label="Maximum interval (days)">
          <kt-input
            type="number"
            :value="String(maxInterval)"
            :error="errors.maxInterval"
            @kt-change="onMaxIntervalChange"
          />
        </kt-label-input>
      </kt-form>

      <kt-form heading="Display" description="Theme and how cards are shown during review." :loading="loading" loading-fields="6">
        <kt-label-input label="Theme">
          <kt-select :options="themeOptions" :value="theme" :clearable="false" @kt-change="(e: CustomEvent) => (theme = e.detail.value)" />
        </kt-label-input>
        <kt-label-input label="Hanzi font">
          <kt-select
            :options="hanziFontOptions"
            :value="hanziFont"
            :clearable="false"
            @kt-change="(e: CustomEvent) => (hanziFont = e.detail.value)"
          />
        </kt-label-input>
        <!-- kt-toggle's `label` is only an accessible name; the visible label is its slot. -->
        <kt-toggle size="small" :checked="showZhuyin" @kt-change="(e: CustomEvent) => (showZhuyin = e.detail.checked)">
          Show zhuyin
        </kt-toggle>
        <kt-toggle size="small" :checked="toneColors" @kt-change="(e: CustomEvent) => (toneColors = e.detail.checked)">
          Colour pinyin by tone
        </kt-toggle>
        <kt-toggle
          size="small"
          :checked="hidePinyinUntilRevealed"
          @kt-change="(e: CustomEvent) => (hidePinyinUntilRevealed = e.detail.checked)"
        >
          Hide the pinyin hint in writing practice
        </kt-toggle>
        <kt-toggle size="small" :checked="strokeFeedback" @kt-change="(e: CustomEvent) => (strokeFeedback = e.detail.checked)">
          Stroke-by-stroke feedback in writing
        </kt-toggle>
        <kt-toggle size="small" :checked="autoPlayAudio" @kt-change="(e: CustomEvent) => (autoPlayAudio = e.detail.checked)">
          Play pronunciation when the answer is shown
        </kt-toggle>
      </kt-form>

      <kt-form
        v-if="reminderAvailable"
        heading="Reminder"
        description="A daily notification with how many cards are due."
        :loading="loading"
        loading-fields="2"
      >
        <kt-toggle size="small" :checked="reminderEnabled" @kt-change="onReminderToggle">Daily reminder</kt-toggle>
        <kt-alert
          v-if="reminderDenied"
          variant="warning"
          description="Notifications are blocked. Turn them on for Fanka in Android settings, under Apps, then Notifications."
        />
        <kt-label-input v-show="reminderEnabled" label="Reminder time">
          <kt-input type="time" name="reminder-time" :value="reminderTime" @kt-change="onReminderTimeChange" />
        </kt-label-input>
      </kt-form>

      <div class="actions fk-session-actions">
        <kt-button type="submit" variant="primary" size="medium" :full-width="compact" :disabled="saving || loading">Save</kt-button>
      </div>
    </form>
  </div>
</template>

<style scoped>
.settings { display: flex; flex-direction: column; gap: var(--gap-card); }
form { display: flex; flex-direction: column; gap: var(--gap-card); }
.actions { display: flex; justify-content: flex-end; }
/* From the shell's breakpoint up, Save sits inline at the end of the form
   rather than stuck to the viewport. */
@media (min-width: 900px) {
  .actions.fk-session-actions { position: static; padding: 0; background: none; flex-direction: row; }
}
.account-status { display: flex; flex-direction: column; gap: var(--gap-element); }
.account-status p { margin: 0; color: var(--text-body); font: var(--font-normal-regular); }
.account-status .muted { color: var(--text-muted); }
</style>
