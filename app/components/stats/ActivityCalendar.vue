<script setup lang="ts">
import type { ActivitySummary } from '~core/stats';

/**
 * A year of study, one square per day, darker for more answers. Kanto has
 * no heatmap, so this is a hand-drawn SVG; each day's count reaches assistive
 * tech through a `title`, and the colours come from the primary tokens.
 */
const props = defineProps<{ days: ActivitySummary['calendar'] }>();

/** viewBox units: a 12-unit cell with a 2-unit gap. Geometry, not a size token. */
const CELL = 12;
const STEP = 14;

const max = computed(() => Math.max(1, ...props.days.map((d) => d.count)));
const cells = computed(() => {
  const offset = props.days[0]?.weekday ?? 0;
  return props.days.map((d, i) => {
    const slot = i + offset;
    const level = d.count === 0 ? 0 : Math.min(4, Math.ceil((d.count / max.value) * 4));
    return { ...d, x: Math.floor(slot / 7) * STEP, y: (slot % 7) * STEP, level };
  });
});
const width = computed(() => (Math.floor((props.days.length + (props.days[0]?.weekday ?? 0) - 1) / 7) + 1) * STEP);
</script>

<template>
  <svg class="calendar" :viewBox="`0 0 ${width} ${7 * STEP}`" role="img" aria-label="Answers per day over the last year">
    <rect v-for="c in cells" :key="c.date" :x="c.x" :y="c.y" :width="CELL" :height="CELL" rx="2" :class="`level-${c.level}`">
      <title>{{ c.date }}: {{ c.count }} answer{{ c.count === 1 ? '' : 's' }}</title>
    </rect>
  </svg>
</template>

<style scoped>
.calendar { display: block; width: 100%; height: auto; }
.level-0 { fill: var(--surface-field); }
.level-1 { fill: var(--color-primary-soft); }
.level-2 { fill: color-mix(in srgb, var(--color-primary-base) 45%, var(--surface-field)); }
.level-3 { fill: color-mix(in srgb, var(--color-primary-base) 75%, var(--surface-field)); }
.level-4 { fill: var(--color-primary-base); }
</style>
