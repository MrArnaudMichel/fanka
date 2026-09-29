<script setup lang="ts">
import type { StrokeOrderEntry } from '~/composables/useStrokeOrderPlayer';

/**
 * The stroke-order player for a whole word: one character at a time, with
 * a segmented control to pick it when there are several.
 */
const props = defineProps<{ entries: StrokeOrderEntry[] }>();

const selected = ref(0);
watch(() => props.entries, () => (selected.value = 0));
const options = computed(() => props.entries.map((e, i) => ({ value: i, label: e.character })));
const entry = computed(() => props.entries[selected.value] ?? props.entries[0]);
</script>

<template>
  <section v-if="entry" class="panel" aria-label="Stroke order">
    <p class="overline">Stroke order</p>
    <kt-segmented-control
      v-if="entries.length > 1"
      size="small"
      label="Character"
      :options="options"
      :value="selected"
      @kt-change="(e: CustomEvent<{ value: number }>) => (selected = e.detail.value)"
    />
    <StrokeOrderPlayer :key="selected" :model="entry.model" :character="entry.character" :highlight="entry.highlight" />
  </section>
</template>

<style scoped>
.panel { display: flex; flex-direction: column; align-items: center; gap: var(--gap-element); width: 100%; max-width: 320px; }
.overline {
  margin: 0;
  font: var(--font-title-overline);
  letter-spacing: var(--letter-spacing-overline);
  text-transform: uppercase;
  color: var(--text-muted);
}
</style>
