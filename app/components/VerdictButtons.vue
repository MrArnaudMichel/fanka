<script setup lang="ts">
import type { Grade } from '~core/srs/types';

/**
 * What follows a checked drawing. The verdict sets the grade — Right is 3
 * (Good), Wrong is 1 (Again), as `WritingButtons` grades them — and it is
 * recorded only on Continue, so Undo in the page header behaves as it does
 * in Review. After a Wrong verdict, "Count it as right" grades 3 instead: the
 * checker can reject a character a teacher would accept. `rightGrade`
 * replaces 3 for a right verdict — stroke-by-stroke writing grades 2 (Hard)
 * when a hint was needed.
 *
 * Retry draws the word again; the page keeps grading the first try (see
 * `useWritingRetry`), so `correct` and `rightGrade` are the first try's.
 *
 * Mounts in the same instant the Check button unmounts, so it takes focus
 * the way `GradeButtons` does, for the same reason.
 */
const props = withDefaults(defineProps<{ correct: boolean; busy: boolean; rightGrade?: Grade }>(), { rightGrade: 3 });
const emit = defineEmits<{ grade: [Grade]; retry: [] }>();

const continueButton = ref<HTMLElement & { updateComplete?: Promise<boolean> }>();

useFocusWhenEnabled(
  () => continueButton.value,
  () => props.busy,
);
</script>

<template>
  <div class="verdict-buttons">
    <kt-button variant="secondary" size="large" icon="rotate-ccw" full-width :disabled="busy" @click="emit('retry')">Retry</kt-button>
    <kt-button
      v-if="!correct"
      variant="secondary"
      size="large"
      full-width
      :disabled="busy"
      @click="emit('grade', 3)"
    >
      Count it as right
    </kt-button>
    <kt-button
      ref="continueButton"
      variant="primary"
      size="large"
      full-width
      :disabled="busy"
      @click="emit('grade', correct ? rightGrade : 1)"
    >
      Continue
    </kt-button>
  </div>
</template>

<style scoped>
.verdict-buttons { display: grid; grid-template-columns: repeat(auto-fit, minmax(140px, 1fr)); gap: var(--gap-button); }
</style>
