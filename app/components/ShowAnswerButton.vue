<script setup lang="ts">
/**
 * Mirrors `GradeButtons`: this button only exists while the current card is
 * unrevealed, and it mounts fresh every time — both on the very first card
 * of a page load and every time grading presents a new, unrevealed card.
 *
 * Those two mounts must behave differently. `GradeButtons` never has this
 * problem (it never renders on a page's first paint — the first thing shown
 * is always this button), but this component does, so `autofocus` is a prop
 * rather than an unconditional `.focus()` call: `review.vue` only sets it
 * once the learner has graded at least one card *in this page instance*, so
 * the very first render — including a reload that resumes mid-session on an
 * unrevealed card — never grabs focus on load. A later render, caused by a
 * grade the learner just made, does.
 */
const props = defineProps<{ autofocus: boolean }>();
const emit = defineEmits<{ reveal: [] }>();

const button = ref<HTMLElement & { updateComplete?: Promise<boolean> }>();

onMounted(async () => {
  if (!props.autofocus) return;
  // `kt-button` is a Lit element: `connectedCallback` runs synchronously
  // when Vue inserts it, but Lit paints the shadow DOM (and so the actual
  // focusable native `<button>` `focus()` delegates to) on its own
  // microtask afterwards. Calling `.focus()` immediately in `onMounted` —
  // before that first render — finds nothing inside the shadow root to
  // focus and silently no-ops. `updateComplete` is Lit's own signal that
  // the first render has landed.
  await button.value?.updateComplete;
  button.value?.focus();
});
</script>

<template>
  <kt-button ref="button" variant="primary" size="large" full-width @click="emit('reveal')">Show answer</kt-button>
</template>
