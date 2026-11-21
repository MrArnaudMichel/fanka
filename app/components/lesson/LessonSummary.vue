<script setup lang="ts">
import type { Word } from '~core/curriculum/types';

/**
 * The end of a lesson or writing session: the score, the words missed, and
 * what happens next. Shown while the results are being saved (`saving`), so
 * Continue waits for the write; a failed write offers to try again.
 */
const props = defineProps<{
  kind: 'lesson' | 'writing';
  right: number;
  total: number;
  missed: Word[];
  wordCount: number;
  saving: boolean;
  failed: boolean;
  hasNext: boolean;
}>();
const emit = defineEmits<{ next: []; back: []; retry: [] }>();

const missedItems = computed(() => props.missed.map((w) => ({ term: w.hanzi, detail: w.readings[0]?.meanings.join('; ') ?? '' })));
const reviewsLine = computed(() => {
  if (props.kind === 'writing') return 'Writing reviews start tomorrow for these words.';
  return props.wordCount === 1 ? 'This word is now in your reviews.' : `These ${props.wordCount} words are now in your reviews.`;
});
</script>

<template>
  <kt-card>
    <div class="summary">
      <span class="seal" aria-hidden="true">完</span>
      <h2>{{ kind === 'lesson' ? 'Lesson complete' : 'Writing session complete' }}</h2>
      <p v-if="total > 0" class="score">{{ right }} of {{ total }} right</p>

      <div v-if="missed.length > 0" class="missed">
        <p class="overline">Missed</p>
        <kt-description-list label="Missed words" :items="missedItems" bordered />
      </div>

      <kt-alert v-if="failed" variant="danger" heading="Couldn't save this lesson" description="Your answers are still here. Try again.">
        <kt-button slot="actions" variant="danger" size="small" icon="refresh-cw" @click="emit('retry')">Retry</kt-button>
      </kt-alert>
      <p v-else-if="saving" class="reviews">Saving your answers…</p>
      <p v-else class="reviews">{{ reviewsLine }}</p>
    </div>
  </kt-card>

  <div class="fk-session-actions">
    <kt-button v-if="hasNext" variant="primary" size="large" full-width :disabled="saving || failed" @click="emit('next')">
      Continue
    </kt-button>
    <kt-button :variant="hasNext ? 'secondary' : 'primary'" size="large" full-width :disabled="saving" @click="emit('back')">
      Back to lessons
    </kt-button>
  </div>
</template>

<style scoped>
.summary { display: flex; flex-direction: column; align-items: center; gap: var(--gap-card); text-align: center; }
.seal { font-family: var(--fk-font-hanzi-serif); font-size: var(--fk-hanzi-prompt); color: var(--color-primary-base); }
h2 { margin: 0; font: var(--font-title-h1); color: var(--text-body); }
.score { margin: 0; font: var(--font-title-h4); color: var(--text-body); }
.reviews { margin: 0; color: var(--text-muted); }
.missed { display: flex; flex-direction: column; gap: var(--gap-element); width: 100%; text-align: start; }
.missed kt-description-list::part(term) { font-family: var(--fk-font-hanzi); font-size: var(--fk-reading-size); }
.overline {
  margin: 0;
  font: var(--font-title-overline);
  letter-spacing: var(--letter-spacing-overline);
  text-transform: uppercase;
  color: var(--text-muted);
}
kt-alert { width: 100%; text-align: start; }
</style>
