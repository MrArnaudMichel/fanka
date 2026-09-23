<script setup lang="ts">
import type { Point } from '~core/chinese/strokes';
import { PAD_SIZE } from '~/composables/useWritingAttempt';

/**
 * A square to draw one character on, finger, stylus or mouse alike. Kanto has
 * no drawing surface, so this is Fanka's own: an inline `<svg>` whose
 * viewBox is the stroke data's 1024 box, so points leave here already at the
 * checker's scale (still y-down — `toModelSpace` flips them).
 *
 * `touch-action: none` on the pad alone keeps a stroke from scrolling the
 * page, while the rest of the page still scrolls normally.
 */
const emit = defineEmits<{ 'strokes-change': [Point[][]] }>();

const svg = ref<SVGSVGElement>();
const strokes = ref<Point[][]>([]);
const current = ref<Point[] | null>(null);
let activePointer: number | null = null;

function toPad(event: PointerEvent): Point {
  const box = svg.value!.getBoundingClientRect();
  return {
    x: ((event.clientX - box.left) * PAD_SIZE) / box.width,
    y: ((event.clientY - box.top) * PAD_SIZE) / box.height,
  };
}

function onDown(event: PointerEvent): void {
  // One stroke at a time: a palm or a second finger must not start another.
  if (activePointer !== null) return;
  activePointer = event.pointerId;
  svg.value!.setPointerCapture(event.pointerId);
  current.value = [toPad(event)];
  event.preventDefault();
}

function onMove(event: PointerEvent): void {
  if (event.pointerId !== activePointer || !current.value) return;
  // Coalesced events keep a fast stroke smooth where the browser batches them.
  const events = event.getCoalescedEvents?.() ?? [event];
  current.value = [...current.value, ...(events.length > 0 ? events : [event]).map(toPad)];
}

function onUp(event: PointerEvent): void {
  if (event.pointerId !== activePointer) return;
  activePointer = null;
  const stroke = current.value;
  current.value = null;
  if (!stroke || stroke.length === 0) return;
  strokes.value = [...strokes.value, stroke];
  emit('strokes-change', strokes.value);
}

function undo(): void {
  strokes.value = strokes.value.slice(0, -1);
  emit('strokes-change', strokes.value);
}

function clear(): void {
  strokes.value = [];
  emit('strokes-change', strokes.value);
}

const points = (stroke: Point[]) => stroke.map((p) => `${p.x},${p.y}`).join(' ');

defineExpose({ undo, clear });
</script>

<template>
  <svg
    ref="svg"
    class="pad"
    :viewBox="`0 0 ${PAD_SIZE} ${PAD_SIZE}`"
    role="img"
    aria-label="Drawing pad"
    @pointerdown="onDown"
    @pointermove="onMove"
    @pointerup="onUp"
    @pointercancel="onUp"
  >
    <HanziGrid />
    <polyline v-for="(stroke, i) in strokes" :key="i" class="ink" :points="points(stroke)" />
    <polyline v-if="current" class="ink" :points="points(current)" />
  </svg>
</template>

<style scoped>
.pad {
  display: block;
  width: 100%;
  aspect-ratio: 1;
  touch-action: none;
  background: var(--surface-field);
  border: var(--border-width) solid var(--border-field);
  border-radius: var(--border-radius-card);
  cursor: crosshair;
}

/* Widths are in viewBox units (a 1024 box), not CSS pixels: they scale with
   the pad, so no Kanto size token applies. */
.ink {
  fill: none;
  stroke: var(--text-body);
  stroke-width: 40;
  stroke-linecap: round;
  stroke-linejoin: round;
}
</style>
