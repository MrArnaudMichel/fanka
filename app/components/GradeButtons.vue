<script setup lang="ts">
import { formatInterval } from '~core/srs/format';
import type { Grade } from '~core/srs/types';

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
// array, in list order.
const gradeButtons = ref<HTMLButtonElement[]>([]);

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
 */
onMounted(() => {
  gradeButtons.value[0]?.focus();
});

/**
 * Tone follows meaning: Again is danger, Easy is info. The interval sits on
 * the button so the learner sees the consequence before committing to it.
 */
const buttons: Array<{ grade: Grade; label: string; tone: string }> = [
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
    <button
      v-for="button in buttons"
      :key="button.grade"
      ref="gradeButtons"
      type="button"
      :class="['grade', button.tone]"
      :disabled="busy"
      :aria-label="`${button.label}, ${interval(button.grade)}`"
      @click="emit('grade', button.grade)"
    >
      <span class="label" aria-hidden="true">{{ button.label }}</span>
      <span class="interval" aria-hidden="true">{{ interval(button.grade) }}</span>
    </button>
  </div>
  <p class="hints">
    <kt-kbd>1</kt-kbd><kt-kbd>2</kt-kbd><kt-kbd>3</kt-kbd><kt-kbd>4</kt-kbd> to grade
    <kt-kbd>U</kt-kbd> undo
  </p>
</template>

<style scoped>
.grades { display: grid; grid-template-columns: repeat(auto-fit, minmax(118px, 1fr)); gap: var(--gap-button); }

.grade {
  cursor: pointer;
  display: flex;
  flex-direction: column;
  gap: 2px;
  align-items: center;
  justify-content: center;
  /* 56px keeps every grade inside the thumb zone on a phone. */
  min-height: 56px;
  padding: 12px 8px;
  border-radius: var(--border-radius);
  border: var(--border-width) solid;
  font: var(--font-normal-medium);
  transition: background-color var(--duration-instant);
}

.grade:focus-visible {
  outline: var(--outline-width) solid var(--color-primary-base);
  outline-offset: 2px;
}

.grade:disabled {
  cursor: not-allowed;
  opacity: 0.5;
}

.grade.danger { border-color: var(--color-danger-base); background: var(--color-danger-soft); color: var(--color-danger-base); }
.grade.danger:hover:not(:disabled) { background: var(--color-danger-hover); }
.grade.warning { border-color: var(--color-warning-base); background: var(--color-warning-soft); color: var(--color-warning-base); }
.grade.warning:hover:not(:disabled) { background: var(--color-warning-hover); }
.grade.success { border-color: var(--color-success-base); background: var(--color-success-soft); color: var(--color-success-base); }
.grade.success:hover:not(:disabled) { background: var(--color-success-hover); }
.grade.info { border-color: var(--color-info-base); background: var(--color-info-soft); color: var(--color-info-base); }
.grade.info:hover:not(:disabled) { background: var(--color-info-hover); }

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
