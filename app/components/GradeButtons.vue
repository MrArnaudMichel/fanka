<script setup lang="ts">
import { formatInterval } from '~core/srs/format';
import type { Grade } from '~core/srs/types';
import type { KtButtonVariant } from 'kanto-ds';

/**
 * `intervals`, not `previews`: the composable anchors each grade's interval
 * to when the preview was computed, not to `Date.now()` at render time. A
 * live `preview.due - Date.now()` would shrink every button's label the
 * longer the page sits backgrounded, even though the schedule itself has
 * not moved — see `useReviewSession`'s `intervals`.
 */
const props = defineProps<{ intervals: Record<Grade, number>; busy: boolean }>();
const emit = defineEmits<{ grade: [Grade] }>();

// Vue auto-collects one ref per v-for(ref="gradeButtons") iteration into this
// array, in list order. Typed with `updateComplete` because these are now
// `kt-button` (Lit) elements — see `useFocusWhenEnabled`'s doc comment for
// why that matters.
const gradeButtons = ref<(HTMLElement & { updateComplete?: Promise<boolean> })[]>([]);

/**
 * This component only exists while the answer is revealed — it replaces the
 * "Show answer" button in the same instant `ReviewCard`'s answer content
 * mounts. That unmounts whatever had focus (the Show-answer button), and
 * without this, focus falls back to `<body>`: a keyboard user gets no
 * indication of where they landed, and the 1–4 grade shortcuts stop being
 * discoverable. The first grade button is the next control they will use,
 * so it is also the natural focus target — and it sits outside
 * `ReviewCard`'s `role="status"` answer region, so the live-region
 * announcement and this focus-driven announcement never read the same text
 * twice.
 *
 * `useFocusWhenEnabled`, not a plain `onMounted(() => ...focus())`: after an
 * undo, this component can mount while `busy` is still `true` (`undoCore`
 * sets `revealed` — what mounts this — before its own `persist()` settles),
 * and a disabled button cannot take focus. The composable retries once
 * `busy` flips back to `false`.
 */
useFocusWhenEnabled(
  () => gradeButtons.value[0],
  () => props.busy,
);

/**
 * Tone follows meaning: Again is danger, Easy is info. The interval sits on
 * the button so the learner sees the consequence before committing to it.
 */
const buttons: Array<{ grade: Grade; label: string; tone: KtButtonVariant }> = [
  { grade: 1, label: 'Again', tone: 'danger' },
  { grade: 2, label: 'Hard', tone: 'warning' },
  { grade: 3, label: 'Good', tone: 'success' },
  { grade: 4, label: 'Easy', tone: 'info' },
];

const interval = (grade: Grade) => {
  const ms = props.intervals[grade];
  return ms === undefined ? '—' : formatInterval(Math.max(0, ms));
};
</script>

<template>
  <div class="grades">
    <kt-button
      v-for="button in buttons"
      :key="button.grade"
      ref="gradeButtons"
      :variant="button.tone"
      size="large"
      full-width
      :disabled="busy"
      :label="`${button.label}, ${interval(button.grade)}`"
      @click="emit('grade', button.grade)"
    >
      <span class="grade-content">
        <span class="label">{{ button.label }}</span>
        <span class="interval">{{ interval(button.grade) }}</span>
      </span>
    </kt-button>
  </div>
  <p class="hints fk-keyboard-only">
    <kt-kbd>1</kt-kbd><kt-kbd>2</kt-kbd><kt-kbd>3</kt-kbd><kt-kbd>4</kt-kbd> to grade
    <kt-kbd>P</kt-kbd> play <kt-kbd>U</kt-kbd> undo
  </p>
</template>

<style scoped>
.grades { display: grid; grid-template-columns: repeat(auto-fit, minmax(118px, 1fr)); gap: var(--gap-button); }

/*
  kt-button's `large` size is 48px tall on desktop (42px on mobile, 46px on
  tablet — see kanto's tokens/responsive.css) — under the 56px phase 1 kept
  for the thumb zone on a phone. `min-height` on the internal button (via
  `::part(button)`, the part kt-button documents for exactly this) wins over
  its own fixed `height` token per the CSS used-height rule, so this raises
  the floor without fighting the component's own sizing.
*/
.grades kt-button::part(button) {
  min-height: 56px;
}

.grade-content { display: flex; flex-direction: column; align-items: center; gap: 2px; }
.interval { font: var(--font-normal-small); font-family: var(--font-family-code); }

.hints {
  display: flex;
  justify-content: center;
  align-items: center;
  gap: 6px;
  margin: 0;
  font: var(--font-normal-small);
  color: var(--text-muted);
}
</style>
