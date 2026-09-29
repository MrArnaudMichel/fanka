<script setup lang="ts">
import type { DeepReadonly } from 'vue';
import { MODEL_BASELINE, type Point } from '~core/chinese/strokes';
import type { CharacterAttempt } from '~/composables/useWritingAttempt';
import { PAD_SIZE } from '~/composables/useWritingAttempt';

/**
 * The verdict for one character: the model's strokes, filled, with the
 * learner's strokes drawn over them — and the first model stroke at fault —
 * in the danger colour for a shape fault, in the warning colour for an
 * order fault.
 *
 * The stroke data's paths are y-up with the baseline at 900; the transform
 * flips them into the same y-down box the learner's strokes were drawn in.
 */
const props = defineProps<{ attempt: DeepReadonly<CharacterAttempt> }>();

const at = computed(() => props.attempt.check.strokeIndex);
const shapeWrong = computed(() => !props.attempt.check.shapeCorrect);
const orderWrong = computed(() => props.attempt.check.shapeCorrect && !props.attempt.check.orderCorrect);
const points = (stroke: readonly Point[]) => stroke.map((p) => `${p.x},${p.y}`).join(' ');
const label = computed(() => `${props.attempt.character}: ${props.attempt.check.shapeCorrect ? 'right' : 'wrong'}`);
</script>

<template>
  <svg class="overlay" :viewBox="`0 0 ${PAD_SIZE} ${PAD_SIZE}`" role="img" :aria-label="label">
    <HanziGrid />
    <g :transform="`scale(1, -1) translate(0, -${MODEL_BASELINE})`">
      <path
        v-for="(d, i) in attempt.model.strokes"
        :key="i"
        :d="d"
        class="model"
        :class="{ wrong: shapeWrong && i === at, order: orderWrong && i === at }"
      />
    </g>
    <polyline v-for="(stroke, i) in attempt.strokes" :key="i" class="ink" :points="points(stroke)" />
  </svg>
</template>

<style scoped>
.overlay {
  display: block;
  width: 100%;
  aspect-ratio: 1;
  background: var(--surface-field);
  border: var(--border-width) solid var(--border-subtle);
  border-radius: var(--border-radius-card);
}

.model { fill: var(--border-field); }
.model.wrong { fill: var(--color-danger-base); }
.model.order { fill: var(--color-warning-base); }

/* viewBox units, as in HanziPad; thinner so the model stays readable under it. */
.ink {
  fill: none;
  stroke: var(--text-body);
  stroke-width: 24;
  stroke-linecap: round;
  stroke-linejoin: round;
  opacity: 0.8;
}
</style>
