<script setup lang="ts">
import type { DeepReadonly } from 'vue';
import type { CharacterStrokes } from '~core/chinese/strokes';
import type { Word } from '~core/curriculum/types';
import type { Settings } from '~core/db/settings';
import LessonReading from '~/components/lesson/LessonReading.vue';
import { useStrokeData } from '~/composables/useStrokeData';
import type { StrokeOrderEntry } from '~/composables/useStrokeOrderPlayer';

/**
 * A word met for the first time: its hanzi, every reading with its meanings,
 * the example sentence with its reading and translation, and on request how
 * its characters are written. The stroke-order button shows only once every
 * character's stroke data has loaded.
 */
const props = defineProps<{ word: Word; settings: DeepReadonly<Settings>; canSpeak: boolean }>();
defineEmits<{ speak: [text: string] }>();

const { load } = useStrokeData();
const strokes = ref<StrokeOrderEntry[] | null>(null);
const showStrokes = ref(false);

watch(
  () => props.word.hanzi,
  async (hanzi) => {
    strokes.value = null;
    showStrokes.value = false;
    const characters = [...hanzi];
    const models = await Promise.all(characters.map((c) => load(c)));
    if (props.word.hanzi !== hanzi || models.some((m) => !m)) return;
    strokes.value = characters.map((character, i) => ({ character, model: models[i] as CharacterStrokes, highlight: null }));
  },
  { immediate: true },
);

const playLabel = computed(() => (props.canSpeak ? 'Play pronunciation' : 'No Chinese voice on this device'));
</script>

<template>
  <kt-card>
    <div class="intro">
      <p class="overline">New word</p>
      <div class="hanzi-row fk-selectable">
        <span class="hanzi">{{ word.hanzi }}</span>
        <kt-button variant="secondary-no-bg" size="small" icon="volume-2" :label="playLabel" :disabled="!canSpeak" @click="$emit('speak', word.hanzi)" />
      </div>
      <p v-if="word.variants?.length" class="muted">Also written {{ word.variants.join(', ') }}</p>

      <div class="readings fk-selectable">
        <div v-for="(reading, i) in word.readings" :key="i" class="reading">
          <LessonReading :pinyin="reading.pinyin" :zhuyin="reading.zhuyin" :settings="settings" />
          <p class="meaning">{{ reading.meanings.join('; ') }}</p>
        </div>
      </div>

      <div v-if="word.example" class="example fk-selectable">
        <p class="overline">Example</p>
        <div class="sentence-row">
          <span class="sentence">{{ word.example.text }}</span>
          <kt-button
            variant="secondary-no-bg"
            size="small"
            icon="volume-2"
            :label="canSpeak ? 'Play the example' : 'No Chinese voice on this device'"
            :disabled="!canSpeak"
            @click="$emit('speak', word.example.text)"
          />
        </div>
        <LessonReading :pinyin="word.example.pinyin" :settings="settings" small />
        <p class="muted">{{ word.example.translation }}</p>
      </div>

      <template v-if="strokes">
        <kt-button
          v-if="!showStrokes"
          variant="secondary"
          size="medium"
          icon="pen-line"
          @click="showStrokes = true"
        >
          Stroke order
        </kt-button>
        <StrokeOrderPanel v-else :entries="strokes" />
      </template>
    </div>
  </kt-card>
</template>

<style scoped>
.intro { display: flex; flex-direction: column; align-items: center; gap: var(--gap-card); text-align: center; }
.overline {
  margin: 0;
  font: var(--font-title-overline);
  letter-spacing: var(--letter-spacing-overline);
  text-transform: uppercase;
  color: var(--text-muted);
}
.hanzi-row, .sentence-row { display: flex; align-items: center; gap: var(--gap-button); }
.hanzi { font-family: var(--fk-font-hanzi); font-size: var(--fk-hanzi-display); color: var(--text-body); }
.readings { display: flex; flex-direction: column; gap: var(--gap-element); }
.reading { display: flex; flex-direction: column; align-items: center; gap: var(--gap-element); }
.meaning { margin: 0; font: var(--font-title-h4); color: var(--text-body); max-width: var(--fk-intro-max); }
.example {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: var(--gap-element);
  width: 100%;
  border-top: var(--border-width) solid var(--border-subtle);
  padding-top: var(--padding-card);
}
.sentence { font: var(--font-title-h4); font-family: var(--fk-font-hanzi); color: var(--text-body); }
.muted { margin: 0; font: var(--font-normal-small); color: var(--text-muted); }
</style>
