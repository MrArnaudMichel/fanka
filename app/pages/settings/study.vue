<script setup lang="ts">
import { toaster } from 'kanto-ds';
import type { KtOption } from 'kanto-ds';
import { useCompactLayout } from '~/composables/useCompactLayout';
import { useSettingsForm } from '~/composables/useSettingsForm';

const { compact } = useCompactLayout();
const { draft, ready, saving, save } = useSettingsForm(['algorithm', 'newPerDay', 'desiredRetention', 'maxInterval'] as const);

const algorithmOptions: KtOption[] = [
  { id: 'FSRS', label: 'FSRS' },
  { id: 'SM-2', label: 'SM-2' },
];
const errors = reactive({ newPerDay: '', maxInterval: '' });
const percent = (n: number) => `${Math.round(n * 100)}%`;

function validate(): boolean {
  errors.newPerDay = Number.isInteger(draft.newPerDay) && draft.newPerDay >= 0 ? '' : 'Enter a whole number, 0 or more.';
  errors.maxInterval = Number.isInteger(draft.maxInterval) && draft.maxInterval >= 1 ? '' : 'Enter a whole number, 1 or more.';
  return !errors.newPerDay && !errors.maxInterval;
}

async function onSave(): Promise<void> {
  if (!validate()) return;
  if (await save()) toaster.success('Settings saved');
  else toaster.error("Couldn't save settings", { description: 'Try again.' });
}
</script>

<template>
  <kt-page-header eyebrow="Settings" heading="Study" description="Daily allowance and the algorithm behind due dates.">
    <kt-button v-if="compact" slot="actions" variant="secondary-no-bg" size="medium" icon="chevron-left" @click="navigateTo('/settings', { replace: true })">Settings</kt-button>
  </kt-page-header>
  <form novalidate @submit.prevent="onSave">
    <kt-form heading="Scheduler" :loading="!ready" loading-fields="4">
      <kt-label-input label="Scheduler algorithm">
        <kt-select :options="algorithmOptions" :value="draft.algorithm" :clearable="false" @kt-change="(e: CustomEvent) => (draft.algorithm = e.detail.value)" />
      </kt-label-input>
      <!-- kt-number-input's own `label` is only an accessible name; kt-label-input shows it and passes it down. -->
      <kt-label-input label="New cards per day">
        <kt-number-input
          :min="0"
          :value="draft.newPerDay"
          :error="errors.newPerDay"
          @kt-change="(e: CustomEvent<{ value: number | null }>) => (draft.newPerDay = e.detail.value ?? Number.NaN)"
        />
      </kt-label-input>
      <kt-slider
        label="Desired retention"
        :min="0.7"
        :max="0.99"
        :step="0.01"
        show-value
        :format="percent"
        :value="String(draft.desiredRetention)"
        @kt-change="(e: CustomEvent<{ value: string }>) => (draft.desiredRetention = Number(e.detail.value))"
      />
      <!-- kt-number-input's own `label` is only an accessible name; kt-label-input shows it and passes it down. -->
      <kt-label-input label="Maximum interval (days)">
        <kt-number-input
          :min="1"
          :value="draft.maxInterval"
          :error="errors.maxInterval"
          @kt-change="(e: CustomEvent<{ value: number | null }>) => (draft.maxInterval = e.detail.value ?? Number.NaN)"
        />
      </kt-label-input>
      <kt-button slot="footer" type="submit" variant="primary" size="medium" :fullWidth="compact" :disabled="saving || !ready">Save</kt-button>
    </kt-form>
  </form>
</template>
