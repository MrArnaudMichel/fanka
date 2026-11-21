<script setup lang="ts">
import type { DeepReadonly } from 'vue';
import type { Exercise } from '~core/curriculum/exercises';
import type { Word } from '~core/curriculum/types';
import type { Settings } from '~core/db/settings';
import LessonReading from '~/components/lesson/LessonReading.vue';

/**
 * Put the example sentence back together from its shuffled segments: tap a
 * segment to place it, tap a placed one to take it back. Check marks the
 * order right or wrong and shows the sentence; Continue reports the result.
 * Segments are tracked by position, since a sentence can repeat one.
 */
const props = defineProps<{ exercise: Exercise; word: Word; settings: DeepReadonly<Settings> }>();
const emit = defineEmits<{ done: [right: boolean] }>();

/** Continue is acted on once: a double tap must not answer the next exercise too. */
let sent = false;
function finish(right: boolean): void {
  if (sent) return;
  sent = true;
  emit('done', right);
}

const segments = computed(() => props.exercise.choices ?? []);
const placed = ref<number[]>([]);
const checked = ref(false);
const continueButton = ref<HTMLElement & { updateComplete?: Promise<boolean> }>();

const answer = computed(() => (Array.isArray(props.exercise.answer) ? props.exercise.answer : [props.exercise.answer]));
const right = computed(() => placed.value.map((i) => segments.value[i]).join('') === answer.value.join(''));
const complete = computed(() => placed.value.length === segments.value.length);

function place(i: number): void {
  if (checked.value || placed.value.includes(i)) return;
  placed.value = [...placed.value, i];
}

function unplace(i: number): void {
  if (checked.value) return;
  placed.value = placed.value.filter((p) => p !== i);
}

async function check(): Promise<void> {
  if (!complete.value) return;
  checked.value = true;
  await nextTick();
  await continueButton.value?.updateComplete;
  continueButton.value?.focus();
}
</script>

<template>
  <kt-card>
    <div class="exercise">
      <p class="overline">Put the sentence in order</p>
      <p class="translation fk-selectable">{{ exercise.prompt }}</p>

      <div class="line" role="group" aria-label="Your sentence">
        <kt-button
          v-for="i in placed"
          :key="`placed-${i}`"
          class="segment"
          variant="secondary"
          size="medium"
          :disabled="checked"
          @click="unplace(i)"
        >
          {{ segments[i] }}
        </kt-button>
        <span v-if="placed.length === 0" class="muted">Tap the words in order</span>
      </div>

      <div class="pool" role="group" aria-label="Words to place">
        <template v-for="(segment, i) in segments" :key="`pool-${i}`">
          <kt-button v-if="!placed.includes(i)" class="segment" variant="dark" size="medium" @click="place(i)">
            {{ segment }}
          </kt-button>
        </template>
      </div>

      <kt-alert v-if="checked" :variant="right ? 'success' : 'danger'" :heading="right ? 'Right' : 'Not quite'">
        <div class="answer fk-selectable">
          <span class="sentence">{{ answer.join('') }}</span>
          <LessonReading v-if="word.example" :pinyin="word.example.pinyin" :settings="settings" small />
        </div>
      </kt-alert>
    </div>
  </kt-card>

  <div class="fk-session-actions">
    <kt-button v-if="checked" ref="continueButton" variant="primary" size="large" full-width @click="finish(right)">
      Continue
    </kt-button>
    <kt-button v-else variant="primary" size="large" icon="check" full-width :disabled="!complete" @click="check">Check</kt-button>
  </div>
</template>

<style scoped>
.exercise { display: flex; flex-direction: column; align-items: center; gap: var(--gap-card); text-align: center; }
.overline {
  margin: 0;
  font: var(--font-title-overline);
  letter-spacing: var(--letter-spacing-overline);
  text-transform: uppercase;
  color: var(--text-muted);
}
.translation { margin: 0; font: var(--font-title-h4); color: var(--text-body); max-width: var(--fk-intro-max); }
.line, .pool { display: flex; flex-wrap: wrap; justify-content: center; align-items: center; gap: var(--gap-button); width: 100%; }
.line {
  min-height: var(--button-height-large);
  padding-bottom: var(--gap-element);
  border-bottom: var(--border-width) solid var(--border-subtle);
}
.segment::part(button) { font-family: var(--fk-font-hanzi); font-size: var(--fk-reading-size); }
.muted { font: var(--font-normal-small); color: var(--text-muted); }
kt-alert { width: 100%; text-align: start; }
.answer { display: flex; flex-direction: column; align-items: flex-start; gap: var(--gap-element); }
.sentence { font: var(--font-title-h4); font-family: var(--fk-font-hanzi); }
</style>
