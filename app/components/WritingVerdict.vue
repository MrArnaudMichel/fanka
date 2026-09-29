<script setup lang="ts">
import type { DeepReadonly } from 'vue';
import type { CharacterAttempt } from '~/composables/useWritingAttempt';
import { characterVerdict, highlightFor, orderVerdict } from '~/utils/writingVerdict';

/**
 * What follows Check: the two verdicts — the character, then its stroke
 * order — the learner's strokes over the model, and the stroke-order player.
 * Only the character verdict grades the card; the order is logged.
 *
 * `kt-alert` has no `eyebrow` prop, so each verdict's label ("Character",
 * "Stroke order") is already folded into `heading` by `writingVerdict.ts`.
 */
const props = defineProps<{ attempts: DeepReadonly<CharacterAttempt[]> }>();

const character = computed(() => characterVerdict(props.attempts as CharacterAttempt[]));
const order = computed(() => orderVerdict(props.attempts as CharacterAttempt[]));
const entries = computed(() =>
  props.attempts.map((a) => ({ character: a.character, model: a.model, highlight: highlightFor(a.check as CharacterAttempt['check']) })),
);
</script>

<template>
  <div class="verdict">
    <div class="alerts">
      <kt-alert :variant="character.variant" :heading="character.heading" />
      <kt-alert :variant="order.variant" :heading="order.heading" />
    </div>
    <div class="overlays" :style="{ gridTemplateColumns: `repeat(${attempts.length}, minmax(0, 160px))` }">
      <StrokeOverlay v-for="(a, i) in attempts" :key="i" :attempt="a" />
    </div>
    <StrokeOrderPanel :entries="entries" />
  </div>
</template>

<style scoped>
.verdict { display: flex; flex-direction: column; align-items: center; gap: var(--gap-form); width: 100%; }
.alerts { display: grid; grid-template-columns: repeat(auto-fit, minmax(200px, 1fr)); gap: var(--gap-button); width: 100%; }
.overlays { display: grid; justify-content: center; gap: var(--gap-button); width: 100%; }
</style>
