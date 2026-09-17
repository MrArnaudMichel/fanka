<script setup lang="ts">
/**
 * Mirrors `GradeButtons`: this button only exists while the current card is
 * unrevealed, and it mounts fresh every time — both on the very first card
 * of a page load and every time grading presents a new, unrevealed card.
 *
 * Those two mounts must behave differently. `GradeButtons` never has this
 * problem (it never renders on a page's first paint — the first thing shown
 * is always this button), but this component does, so `autofocus` is a prop
 * rather than an unconditional focus attempt: `review.vue` only sets it
 * once the learner has graded at least one card *in this page instance*, so
 * the very first render — including a reload that resumes mid-session on an
 * unrevealed card — never grabs focus on load. A later render, caused by a
 * grade the learner just made, does.
 *
 * `busy`, like `GradeButtons`, disables the button while a grade or undo is
 * still in flight — and is folded into the same "should this take focus"
 * gate as `autofocus`, via `useFocusWhenEnabled`, rather than handled
 * separately: this button can mount already `busy` (`gradeCore` sets
 * `revealed` — what mounts this — before its own `persist()` settles, the
 * same ordering `GradeButtons` deals with after an undo), and without the
 * composable's retry-on-enabled, adding `disabled` here would silently
 * reintroduce the exact focus-stranding bug being fixed.
 */
const props = defineProps<{ autofocus: boolean; busy: boolean }>();
const emit = defineEmits<{ reveal: [] }>();

const button = ref<HTMLElement & { updateComplete?: Promise<boolean> }>();

useFocusWhenEnabled(
  () => button.value,
  () => props.busy || !props.autofocus,
);
</script>

<template>
  <kt-button ref="button" variant="primary" size="large" full-width :disabled="busy" @click="emit('reveal')">
    Show answer
  </kt-button>
</template>
