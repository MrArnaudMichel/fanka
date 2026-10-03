<script setup lang="ts">
import { toaster } from 'kanto-ds';
import { useCompactLayout } from '~/composables/useCompactLayout';
import { useReminder } from '~/composables/useReminder';
import { useSettingsForm } from '~/composables/useSettingsForm';

const { compact } = useCompactLayout();
const { draft, ready, saving, save } = useSettingsForm(['reminderEnabled', 'reminderTime'] as const);
const { native, requestPermission } = useReminder();
const denied = ref(false);

async function onToggle(event: CustomEvent<{ checked: boolean }>): Promise<void> {
  draft.reminderEnabled = event.detail.checked;
  denied.value = false;
  if (event.detail.checked && !(await requestPermission())) {
    draft.reminderEnabled = false;
    denied.value = true;
  }
}

function onTimeChange(event: CustomEvent<{ value: string }>): void {
  if (event.detail.value) draft.reminderTime = event.detail.value;
}

async function onSave(): Promise<void> {
  if (await save()) toaster.success('Settings saved');
  else toaster.error("Couldn't save settings", { description: 'Try again.' });
}
</script>

<template>
  <kt-page-header eyebrow="Settings" heading="Reminders" description="A daily notification with how many cards are due.">
    <kt-button v-if="compact" slot="actions" variant="secondary-no-bg" size="medium" icon="chevron-left" @click="navigateTo('/settings')">Settings</kt-button>
  </kt-page-header>
  <kt-empty-state
    v-if="!native"
    icon="bell"
    heading="Reminders need the Android app"
    description="Install Fanka on Android to get a daily notification with how many cards are due."
  />
  <form v-else novalidate @submit.prevent="onSave">
    <kt-form heading="Daily reminder" :loading="!ready" loading-fields="2">
      <kt-toggle size="small" :checked="draft.reminderEnabled" @kt-change="onToggle">Daily reminder</kt-toggle>
      <kt-alert
        v-if="denied"
        variant="warning"
        description="Notifications are blocked. Turn them on for Fanka in Android settings, under Apps, then Notifications."
      />
      <kt-label-input v-show="draft.reminderEnabled" label="Reminder time">
        <kt-input type="time" name="reminder-time" :value="draft.reminderTime" @kt-change="onTimeChange" />
      </kt-label-input>
      <kt-button slot="footer" type="submit" variant="primary" size="medium" :full-width="compact" :disabled="saving || !ready">Save</kt-button>
    </kt-form>
  </form>
</template>
