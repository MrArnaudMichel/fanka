<script setup lang="ts">
import type { Grade } from '~core/srs/types';

/**
 * Same shape as `GradeButtons`, cut down to the two outcomes writing
 * practice actually asks for: whether the character the learner wrote on
 * paper matches. "Wrong" grades `1` (Again — a lapse); "Right" grades `3`
 * (Good) rather than `4` (Easy), the same middling default `review.vue`'s
 * space-bar shortcut uses, since a writing check has no finer-grained signal
 * to offer than a plain pass.
 */
const props = defineProps<{ busy: boolean }>();
const emit = defineEmits<{ grade: [Grade] }>();

const buttons = ref<(HTMLElement & { updateComplete?: Promise<boolean> })[]>([]);

useFocusWhenEnabled(
  () => buttons.value[0],
  () => props.busy,
);
</script>

<template>
  <div class="grades">
    <kt-button ref="buttons" variant="danger" size="large" full-width :disabled="busy" @click="emit('grade', 1)">Wrong</kt-button>
    <kt-button ref="buttons" variant="success" size="large" full-width :disabled="busy" @click="emit('grade', 3)">Right</kt-button>
  </div>
</template>

<style scoped>
.grades { display: grid; grid-template-columns: repeat(auto-fit, minmax(118px, 1fr)); gap: var(--gap-button); }
.grades kt-button::part(button) { min-height: 56px; }
</style>
