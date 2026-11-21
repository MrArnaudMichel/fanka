<script setup lang="ts">
import type { DeepReadonly } from 'vue';
import type { Exercise } from '~core/curriculum/exercises';
import type { Word } from '~core/curriculum/types';
import type { Settings } from '~core/db/settings';
import LessonReading from '~/components/lesson/LessonReading.vue';

/**
 * One multiple-choice exercise: meaning to hanzi, hanzi to meaning, reading,
 * listening or cloze. The first choice is the answer: it is marked right or
 * wrong at once, the correct choice and the word are shown, and Continue
 * reports the result. A listening exercise plays the word when it appears.
 */
const props = defineProps<{
  exercise: Exercise;
  word: Word;
  settings: DeepReadonly<Settings>;
  canSpeak: boolean;
}>();
const emit = defineEmits<{ done: [right: boolean]; speak: [text: string] }>();

const chosen = ref<string | null>(null);
const right = computed(() => chosen.value === props.exercise.answer);
const continueButton = ref<HTMLElement & { updateComplete?: Promise<boolean> }>();

const instruction = computed(() => {
  switch (props.exercise.kind) {
    case 'meaning-to-hanzi':
      return 'Choose the word';
    case 'hanzi-to-meaning':
      return 'Choose the meaning';
    case 'reading':
      return 'Choose the reading';
    case 'listening':
      return 'Choose what you hear';
    default:
      return 'Fill the gap';
  }
});

/** Choices in hanzi take the hanzi font; meanings and readings do not. */
const hanziChoices = computed(() => ['meaning-to-hanzi', 'listening', 'cloze'].includes(props.exercise.kind));

function variant(choice: string): string {
  if (chosen.value === null) return 'secondary';
  if (choice === props.exercise.answer) return 'success';
  if (choice === chosen.value) return 'danger';
  return 'secondary';
}

async function choose(choice: string): Promise<void> {
  if (chosen.value !== null) return;
  chosen.value = choice;
  await nextTick();
  await continueButton.value?.updateComplete;
  continueButton.value?.focus();
}

onMounted(() => {
  if (props.exercise.kind === 'listening' && props.canSpeak) emit('speak', props.word.hanzi);
});
</script>

<template>
  <kt-card>
    <div class="exercise">
      <p class="overline">{{ instruction }}</p>

      <p v-if="exercise.kind === 'meaning-to-hanzi'" class="meaning fk-selectable">{{ exercise.prompt }}</p>
      <kt-button
        v-else-if="exercise.kind === 'listening'"
        variant="secondary"
        size="large"
        icon="volume-2"
        :disabled="!canSpeak"
        @click="emit('speak', word.hanzi)"
      >
        Play again
      </kt-button>
      <div v-else-if="exercise.kind === 'cloze'" class="cloze fk-selectable">
        <p class="sentence">{{ exercise.prompt }}</p>
        <p class="muted">{{ word.example?.translation }}</p>
      </div>
      <p v-else class="hanzi fk-selectable">{{ exercise.prompt }}</p>

      <div class="choices" role="group" :aria-label="instruction">
        <kt-button
          v-for="choice in exercise.choices"
          :key="choice"
          :variant="variant(choice)"
          size="large"
          full-width
          :disabled="chosen !== null && choice !== exercise.answer && choice !== chosen"
          :class="{ 'hanzi-choice': hanziChoices }"
          @click="choose(choice)"
        >
          <LessonReading v-if="exercise.kind === 'reading'" :pinyin="choice" :settings="settings" />
          <template v-else>{{ choice }}</template>
        </kt-button>
      </div>

      <kt-alert v-if="chosen !== null" :variant="right ? 'success' : 'danger'" :heading="right ? 'Right' : 'Not quite'">
        <div class="answer fk-selectable">
          <span class="answer-hanzi">{{ word.hanzi }}</span>
          <LessonReading
            :pinyin="word.readings[0]?.pinyin ?? ''"
            :zhuyin="word.readings[0]?.zhuyin"
            :settings="settings"
            small
          />
          <span>{{ word.readings[0]?.meanings.join('; ') }}</span>
        </div>
      </kt-alert>
    </div>
  </kt-card>

  <div v-if="chosen !== null" class="fk-session-actions">
    <kt-button ref="continueButton" variant="primary" size="large" full-width @click="emit('done', right)">Continue</kt-button>
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
.meaning { margin: 0; font: var(--font-title-h4); color: var(--text-body); max-width: var(--fk-intro-max); }
.hanzi { margin: 0; font-family: var(--fk-font-hanzi); font-size: var(--fk-hanzi-prompt); color: var(--text-body); }
.cloze { display: flex; flex-direction: column; gap: var(--gap-element); }
.sentence { margin: 0; font: var(--font-title-h4); font-family: var(--fk-font-hanzi); color: var(--text-body); }
.muted { margin: 0; font: var(--font-normal-small); color: var(--text-muted); }
.choices { display: flex; flex-direction: column; gap: var(--gap-button); width: 100%; max-width: var(--fk-intro-max); }
.hanzi-choice::part(button) { font-family: var(--fk-font-hanzi); font-size: var(--fk-hanzi-choice); }
kt-alert { width: 100%; text-align: start; }
.answer { display: flex; flex-wrap: wrap; align-items: baseline; gap: var(--gap-button); }
.answer-hanzi { font-family: var(--fk-font-hanzi); font-size: var(--fk-reading-size); }
</style>
