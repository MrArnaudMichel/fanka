<script setup lang="ts">
import { toaster } from 'kanto-ds';
import { MAX_REMINDER_TIMES, normaliseTimes } from '~core/reminder/schedule';
import { useCompactLayout } from '~/composables/useCompactLayout';
import { useReminder } from '~/composables/useReminder';
import { useLeaveGuard } from '~/composables/useLeaveGuard';
import { useSettingsForm } from '~/composables/useSettingsForm';

const SUGGESTED_TIMES = ['08:00', '12:00', '19:00', '21:00'];
// Monday first in the bar; stored as Date#getDay() numbers (0 = Sunday).
const WEEK = [1, 2, 3, 4, 5, 6, 0];
// 2026-10-04 is a Sunday, so day d is 4 + d.
const dayName = (d: number) => new Intl.DateTimeFormat(undefined, { weekday: 'short' }).format(new Date(2026, 9, 4 + d));

const { compact } = useCompactLayout();
const { draft, ready, saving, dirty, save } = useSettingsForm(['reminderEnabled', 'reminderTimes', 'reminderDays'] as const);
const leaveGuard = useLeaveGuard(dirty);
const { native, requestPermission, sendTest } = useReminder();
const denied = ref(false);
const daysError = ref('');
const testing = ref(false);

async function onToggle(event: CustomEvent<{ checked: boolean }>): Promise<void> {
  draft.reminderEnabled = event.detail.checked;
  denied.value = false;
  if (event.detail.checked && !(await requestPermission())) {
    draft.reminderEnabled = false;
    denied.value = true;
  }
}

function onDays(event: CustomEvent<{ value: string[] | null }>): void {
  draft.reminderDays = (event.detail.value ?? []).map(Number);
  daysError.value = '';
}

function onTime(index: number, event: CustomEvent<{ value: string | null }>): void {
  if (!event.detail.value) return; // incomplete: keep the last full time
  const next = [...draft.reminderTimes];
  next[index] = event.detail.value;
  draft.reminderTimes = next;
}

function addTime(): void {
  const free = SUGGESTED_TIMES.find((t) => !draft.reminderTimes.includes(t)) ?? '12:00';
  draft.reminderTimes = [...draft.reminderTimes, free];
}

function removeTime(index: number): void {
  draft.reminderTimes = draft.reminderTimes.filter((_, i) => i !== index);
}

async function onTest(): Promise<void> {
  testing.value = true;
  const result = await sendTest();
  testing.value = false;
  if (result === 'sent') toaster.success('Test notification sent');
  else if (result === 'denied') denied.value = true;
  else toaster.error("Couldn't send a test notification", { description: 'Try again.' });
}

async function onSave(): Promise<void> {
  if (draft.reminderEnabled && draft.reminderDays.length === 0) {
    daysError.value = 'Choose at least one day.';
    return;
  }
  draft.reminderTimes = normaliseTimes(draft.reminderTimes);
  if (await save()) toaster.success('Settings saved');
  else toaster.error("Couldn't save settings", { description: 'Try again.' });
}
</script>

<template>
  <SettingsHeader heading="Reminders" description="Notifications with how many cards are due." />

  <kt-empty-state
    v-if="!native"
    icon="bell"
    heading="Reminders need the Android app"
    description="Install Fanka on Android to get notifications with how many cards are due."
  />

  <form v-else novalidate @submit.prevent="onSave">
    <kt-form heading="Schedule" :loading="!ready" loading-fields="3">
      <kt-toggle size="small" :checked="draft.reminderEnabled" @kt-change="onToggle">Remind me to study</kt-toggle>
      <kt-alert
        v-if="denied"
        variant="warning"
        description="Notifications are blocked. Turn them on for Fanka in Android settings, under Apps, then Notifications."
      />
      <template v-if="draft.reminderEnabled">
        <kt-label-input label="Days">
          <kt-toggle-button-group multiple :value="draft.reminderDays.map(String)" @kt-change="onDays">
            <kt-toggle-button v-for="d in WEEK" :key="d" variant="outline" :value="String(d)">{{ dayName(d) }}</kt-toggle-button>
          </kt-toggle-button-group>
        </kt-label-input>
        <kt-alert v-if="daysError" variant="danger" :description="daysError" />

        <div class="times">
          <div v-for="(time, index) in draft.reminderTimes" :key="index" class="time-row">
            <kt-time-input :label="`Time ${index + 1}`" :value="time" @kt-change="onTime(index, $event)" />
            <kt-button
              variant="secondary-no-bg"
              size="medium"
              icon="x"
              :label="`Remove time ${index + 1}`"
              :disabled="draft.reminderTimes.length === 1"
              @click="removeTime(index)"
            />
          </div>
          <kt-button variant="secondary" size="medium" icon="plus" :disabled="draft.reminderTimes.length >= MAX_REMINDER_TIMES" @click="addTime">Add time</kt-button>
        </div>
      </template>
      <kt-button slot="footer" variant="secondary" size="medium" icon="send" :disabled="testing" @click="onTest">Send test notification</kt-button>
      <kt-button slot="footer" type="submit" variant="primary" size="medium" :fullWidth="compact" :disabled="saving || !ready || !dirty">Save</kt-button>
    </kt-form>
  </form>
  <UnsavedChangesDialog :open="leaveGuard.asking.value" @stay="leaveGuard.stay" @leave="leaveGuard.leave" />
</template>

<style scoped>
form { display: flex; flex-direction: column; }
.times { display: flex; flex-direction: column; gap: var(--gap-element); align-items: flex-start; }
.time-row { display: flex; align-items: flex-end; gap: var(--gap-element); }
</style>
