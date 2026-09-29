<script setup lang="ts">
import type { DeepReadonly } from 'vue';
import { type CharacterStrokes, MODEL_BASELINE, strokeOrderFrames } from '~core/chinese/strokes';
import { useStrokeOrderPlayer } from '~/composables/useStrokeOrderPlayer';
import { PAD_SIZE } from '~/composables/useWritingAttempt';

/**
 * Shows how a character is written: each stroke fills in along its median,
 * in writing direction, clipped to the stroke's outline (the technique Hanzi
 * Writer uses), with its number at its start. Plays once on mount; Replay,
 * previous and next take over from there. `highlight` marks the stroke the
 * learner got wrong, in the danger colour for a shape fault and the warning
 * colour for an order fault.
 */
const props = defineProps<{
  model: DeepReadonly<CharacterStrokes>;
  character: string;
  highlight?: { index: number; tone: 'danger' | 'warning' } | null;
}>();

const frames = computed(() => strokeOrderFrames(props.model as CharacterStrokes));
const player = useStrokeOrderPlayer(() => frames.value.length);
const uid = useId();
const flip = `scale(1, -1) translate(0, -${MODEL_BASELINE})`;
const points = (median: readonly { x: number; y: number }[]) => median.map((p) => `${p.x},${p.y}`).join(' ');

onMounted(() => player.replay());
watch(() => props.model, () => player.replay());

function strokeClass(i: number): Record<string, boolean> {
  const done = i < player.shown.value;
  const marked = props.highlight?.index === i && done;
  return { done, danger: marked && props.highlight?.tone === 'danger', warning: marked && props.highlight?.tone === 'warning' };
}
</script>

<template>
  <div class="player">
    <svg class="board" :viewBox="`0 0 ${PAD_SIZE} ${PAD_SIZE}`" role="img" :aria-label="`Stroke order for ${character}`">
      <HanziGrid />
      <defs>
        <clipPath v-for="(d, i) in model.strokes" :id="`${uid}-${i}`" :key="i">
          <path :d="d" :transform="flip" />
        </clipPath>
      </defs>
      <g :transform="flip">
        <path v-for="(d, i) in model.strokes" :key="i" :d="d" class="stroke" :class="strokeClass(i)" />
      </g>
      <polyline
        v-if="player.drawing.value !== null"
        :key="`${player.run.value}-${player.drawing.value}`"
        class="brush"
        :clip-path="`url(#${uid}-${player.drawing.value})`"
        :points="points(frames[player.drawing.value]!.median)"
        :style="{ '--length': frames[player.drawing.value]!.length }"
        @animationend="player.strokeEnded()"
      />
      <template v-for="(frame, i) in frames" :key="`n${i}`">
        <text v-if="i < player.current.value" class="number" :x="frame.start.x" :y="frame.start.y">{{ i + 1 }}</text>
      </template>
    </svg>

    <div class="controls">
      <kt-button variant="secondary-no-bg" size="small" icon="rotate-ccw" label="Replay" @click="player.replay()" />
      <kt-button variant="secondary-no-bg" size="small" icon="chevron-left" label="Previous stroke" :disabled="player.current.value === 0" @click="player.prev()" />
      <span class="count">{{ player.current.value }} / {{ frames.length }}</span>
      <kt-button variant="secondary-no-bg" size="small" icon="chevron-right" label="Next stroke" :disabled="player.shown.value >= frames.length" @click="player.next()" />
    </div>
  </div>
</template>

<style scoped>
.player { display: flex; flex-direction: column; align-items: center; gap: var(--gap-element); width: 100%; }
.board {
  display: block;
  width: 100%;
  aspect-ratio: 1;
  background: var(--surface-field);
  border: var(--border-width) solid var(--border-subtle);
  border-radius: var(--border-radius-card);
}
.stroke { fill: var(--border-field); }
.stroke.done { fill: var(--text-body); }
.stroke.danger { fill: var(--color-danger-base); }
.stroke.warning { fill: var(--color-warning-base); }

/*
  viewBox units (the 1024 box), as in HanziPad: wide enough to cover the
  widest stroke, since the clip path trims it to the stroke's outline. The
  extra 160 in the dash covers the round caps at both ends.
*/
.brush {
  fill: none;
  stroke: var(--text-body);
  stroke-width: 160;
  stroke-linecap: round;
  stroke-linejoin: round;
  stroke-dasharray: calc(var(--length) + 160);
  stroke-dashoffset: calc(var(--length) + 160);
  animation: fk-stroke-draw calc(var(--duration-normal) * 3) linear forwards;
}
@keyframes fk-stroke-draw { to { stroke-dashoffset: 0; } }

/* viewBox units; the halo keeps a number legible over a filled stroke. */
.number {
  font-family: var(--font-family-code);
  font-size: 64px;
  fill: var(--color-primary-base);
  stroke: var(--surface-field);
  stroke-width: 12;
  paint-order: stroke;
  text-anchor: middle;
  dominant-baseline: central;
}

.controls { display: flex; align-items: center; gap: var(--gap-button); }
.count { font: var(--font-normal-small); font-family: var(--font-family-code); color: var(--text-muted); }
</style>
