<script setup lang="ts">
import { PAD_SIZE } from '~/composables/useWritingAttempt';

/**
 * The 米字格 guide behind a character: both axes and both diagonals. An SVG
 * group, for use inside a 1024 viewBox (`HanziPad`, `StrokeOverlay`).
 */
const S = PAD_SIZE;
const lines = [
  [S / 2, 0, S / 2, S],
  [0, S / 2, S, S / 2],
  [0, 0, S, S],
  [S, 0, 0, S],
];
</script>

<template>
  <g class="grid" aria-hidden="true">
    <line v-for="([x1, y1, x2, y2], i) in lines" :key="i" :x1="x1" :y1="y1" :x2="x2" :y2="y2" />
  </g>
</template>

<style scoped>
/* viewBox units, as in HanziPad. */
.grid line {
  stroke: var(--border-subtle);
  stroke-width: 4;
  stroke-dasharray: 24 20;
}
</style>
