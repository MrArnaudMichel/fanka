<script setup lang="ts">
import type { SpeakingQuestion } from '~core/speaking';
import { answerText } from '~core/speaking';

/**
 * One discussion question: hear it, answer aloud, then reveal the model
 * answer and repeat it sentence by sentence.
 */
defineProps<{ question: SpeakingQuestion; number: number; showPinyin: boolean; showTranslation: boolean; canSpeak: boolean }>();
defineEmits<{ speak: [text: string] }>();

const revealed = ref(false);
</script>

<template>
  <kt-card>
    <p slot="header" class="overline">Question {{ number }}</p>

    <div class="question fk-selectable">
      <div class="line">
        <p class="hanzi">{{ question.prompt.hanzi }}</p>
        <kt-button
          variant="secondary-no-bg"
          size="small"
          icon="volume-2"
          :label="canSpeak ? 'Play question' : 'No Chinese voice on this device'"
          :disabled="!canSpeak"
          @click="$emit('speak', question.prompt.hanzi)"
        />
      </div>
      <p v-if="showPinyin" class="pinyin">{{ question.prompt.pinyin }}</p>
      <p v-if="showTranslation" class="translation">{{ question.prompt.translation }}</p>
    </div>

    <div class="actions">
      <kt-button variant="secondary" :icon="revealed ? 'eye-off' : 'eye'" @click="revealed = !revealed">
        {{ revealed ? 'Hide model answer' : 'Show model answer' }}
      </kt-button>
      <kt-button v-if="revealed" variant="secondary" icon="play" :disabled="!canSpeak" @click="$emit('speak', answerText(question))">
        Play answer
      </kt-button>
    </div>

    <div v-if="revealed" class="answer fk-selectable" role="status" aria-live="polite">
      <div v-for="(line, i) in question.answer" :key="i" class="sentence">
        <div class="line">
          <p class="hanzi">{{ line.hanzi }}</p>
          <kt-button
            variant="secondary-no-bg"
            size="small"
            icon="volume-2"
            :label="canSpeak ? `Play sentence ${i + 1}` : 'No Chinese voice on this device'"
            :disabled="!canSpeak"
            @click="$emit('speak', line.hanzi)"
          />
        </div>
        <p v-if="showPinyin" class="pinyin">{{ line.pinyin }}</p>
        <p v-if="showTranslation" class="translation">{{ line.translation }}</p>
      </div>
    </div>
  </kt-card>
</template>

<style scoped>
.overline { margin: 0; font: var(--font-title-overline); letter-spacing: var(--letter-spacing-overline); text-transform: uppercase; color: var(--text-muted); }
.question, .answer { display: flex; flex-direction: column; gap: var(--gap-button); }
.answer { gap: var(--gap-form); border-top: var(--border-width) solid var(--border-subtle); padding-top: var(--padding-card); }
.sentence { display: flex; flex-direction: column; gap: var(--gap-button); }
.line { display: flex; align-items: flex-start; justify-content: space-between; gap: var(--gap-button); }
.actions { display: flex; flex-wrap: wrap; gap: var(--gap-button); }
p { margin: 0; }
/* Same hanzi, pinyin and translation sizes as the review card's example. */
.hanzi { font-family: var(--fk-font-hanzi); font-size: 26px; line-height: 1.5; color: var(--text-body); }
.pinyin { font-family: var(--font-family-code); font-size: 13px; color: var(--text-muted); }
.translation { font: var(--font-normal-regular); color: var(--text-muted); }
</style>
