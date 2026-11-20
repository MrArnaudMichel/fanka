<script setup lang="ts">
import { KT_ACCENTS, KT_TEXT_SIZES, toaster } from 'kanto-ds';
import type { KtOption } from 'kanto-ds';
import { useCompactLayout } from '~/composables/useCompactLayout';
import { useSettings } from '~/composables/useSettings';
import { useLeaveGuard } from '~/composables/useLeaveGuard';
import { useSettingsForm } from '~/composables/useSettingsForm';

const { compact } = useCompactLayout();
const { draft, ready, saving, dirty, save } = useSettingsForm(
  ['theme', 'accent', 'textSize', 'hanziFont', 'reading', 'toneColors', 'hidePinyinUntilRevealed', 'strokeFeedback', 'autoPlayAudio'] as const,
);
const { settings } = useSettings();
const leaveGuard = useLeaveGuard(dirty);

const themeOptions: KtOption[] = [
  { id: 'auto', label: 'System' },
  { id: 'light', label: 'Light' },
  { id: 'dark', label: 'Dark' },
];
const accentOptions: KtOption[] = KT_ACCENTS.map((a) => ({ id: a.id, label: a.label }));
const textSizeOptions: KtOption[] = KT_TEXT_SIZES.map((t) => ({ id: t.id, label: t.label }));
const hanziFontOptions: KtOption[] = [
  { id: 'serif', label: 'Serif' },
  { id: 'sans', label: 'Sans' },
];

const READING_OPTIONS = [
  { value: 'zhuyin', label: 'Zhuyin' },
  { value: 'pinyin', label: 'Pinyin' },
  { value: 'both', label: 'Both' },
];

async function onSave(): Promise<void> {
  if (await save()) toaster.success('Settings saved');
  else toaster.error("Couldn't save settings", { description: 'Try again.' });
}
</script>

<template>
  <SettingsHeader heading="Display" description="Theme, colour and how cards are shown." />
  <form novalidate @submit.prevent="onSave">
    <kt-form heading="Appearance" :loading="!ready" loading-fields="4">
      <kt-label-input label="Theme">
        <kt-select :options="themeOptions" :value="draft.theme" :clearable="false" @kt-change="(e: CustomEvent) => (draft.theme = e.detail.value)" />
      </kt-label-input>
      <kt-label-input label="Accent colour">
        <kt-select :options="accentOptions" :value="draft.accent" :clearable="false" @kt-change="(e: CustomEvent) => (draft.accent = e.detail.value)" />
      </kt-label-input>
      <kt-label-input label="Text size">
        <kt-select :options="textSizeOptions" :value="draft.textSize" :clearable="false" @kt-change="(e: CustomEvent) => (draft.textSize = e.detail.value)" />
      </kt-label-input>
      <kt-label-input label="Hanzi font">
        <kt-select :options="hanziFontOptions" :value="draft.hanziFont" :clearable="false" @kt-change="(e: CustomEvent) => (draft.hanziFont = e.detail.value)" />
      </kt-label-input>
    </kt-form>

    <kt-form heading="Cards" :loading="!ready" loading-fields="5">
      <kt-label-input v-if="settings.bundle !== 'mainland'" label="Reading">
        <kt-segmented-control label="Reading" :options="READING_OPTIONS" :value="draft.reading" @kt-change="(e: CustomEvent) => (draft.reading = e.detail.value)" />
      </kt-label-input>
      <!-- kt-toggle's `label` is only an accessible name; the visible label is its slot. -->
      <kt-toggle size="small" :checked="draft.toneColors" @kt-change="(e: CustomEvent) => (draft.toneColors = e.detail.checked)">
        Colour pinyin by tone
      </kt-toggle>
      <kt-toggle
        size="small"
        :checked="draft.hidePinyinUntilRevealed"
        @kt-change="(e: CustomEvent) => (draft.hidePinyinUntilRevealed = e.detail.checked)"
      >
        Hide the pinyin hint in writing practice
      </kt-toggle>
      <kt-toggle size="small" :checked="draft.strokeFeedback" @kt-change="(e: CustomEvent) => (draft.strokeFeedback = e.detail.checked)">
        Stroke-by-stroke feedback in writing
      </kt-toggle>
      <kt-toggle size="small" :checked="draft.autoPlayAudio" @kt-change="(e: CustomEvent) => (draft.autoPlayAudio = e.detail.checked)">
        Play pronunciation when the answer is shown
      </kt-toggle>
      <kt-button slot="footer" type="submit" variant="primary" size="medium" :fullWidth="compact" :disabled="saving || !ready || !dirty">Save</kt-button>
    </kt-form>
  </form>
  <UnsavedChangesDialog :open="leaveGuard.asking.value" @stay="leaveGuard.stay" @leave="leaveGuard.leave" />
</template>
