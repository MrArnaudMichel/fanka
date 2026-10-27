<script setup lang="ts">
import { SPEAKING_LESSONS } from '~core/speaking';
import SpeakingQuestionCard from '~/components/SpeakingQuestionCard.vue';

/**
 * Speaking practice on a lesson's discussion questions: answer aloud, then
 * listen to a model answer and repeat it. Nothing here is scheduled or saved.
 */
const { supported, speaking, speak, stop, ready } = useSpeech();

/** Whether the voice check has finished, so "no voice" is not shown while it runs. */
const checked = ref(false);
onMounted(() => ready.then(() => (checked.value = true)));
onBeforeUnmount(() => void stop());

/** `?lesson=lesson-5` from Lessons opens that lesson's questions. */
const asked = useRoute().query.lesson;
const lessonId = ref(SPEAKING_LESSONS.find((l) => l.id === asked)?.id ?? SPEAKING_LESSONS[0]!.id);
const lesson = computed(() => SPEAKING_LESSONS.find((l) => l.id === lessonId.value) ?? SPEAKING_LESSONS[0]!);
const lessonOptions = SPEAKING_LESSONS.map((l) => ({ value: l.id, label: l.label }));

const slow = ref(false);
const showPinyin = ref(true);
const showTranslation = ref(false);

const play = (text: string) => void speak(text, { slow: slow.value });
</script>

<template>
  <div class="speaking">
    <kt-page-header
      eyebrow="Practice"
      heading="Speaking"
      description="Answer each question aloud first. Then reveal the model answer, play it sentence by sentence and repeat after it."
    />

    <kt-alert v-if="checked && !supported" variant="warning" description="No Chinese voice on this device. Add one in the system's text-to-speech settings to hear the questions and answers." />

    <div class="toolbar">
      <kt-segmented-control label="Lesson" :options="lessonOptions" :value="lessonId" @kt-change="(e: CustomEvent) => (lessonId = e.detail.value)" />
      <div class="switches">
        <kt-toggle size="small" :checked="slow" @kt-change="(e: CustomEvent) => (slow = e.detail.checked)">Slow speech</kt-toggle>
        <kt-toggle size="small" :checked="showPinyin" @kt-change="(e: CustomEvent) => (showPinyin = e.detail.checked)">Pinyin</kt-toggle>
        <kt-toggle size="small" :checked="showTranslation" @kt-change="(e: CustomEvent) => (showTranslation = e.detail.checked)">Translation</kt-toggle>
        <kt-button v-if="speaking" variant="secondary-no-bg" size="small" icon="square" @click="stop()">Stop</kt-button>
      </div>
    </div>

    <div class="title fk-selectable">
      <p class="title-hanzi">{{ lesson.title.hanzi }}</p>
      <p class="title-sub">{{ lesson.title.pinyin }} · {{ lesson.title.translation }}</p>
    </div>

    <SpeakingQuestionCard
      v-for="(question, i) in lesson.questions"
      :key="question.id"
      :question="question"
      :number="i + 1"
      :show-pinyin="showPinyin"
      :show-translation="showTranslation"
      :can-speak="supported"
      @speak="play"
    />
  </div>
</template>

<style scoped>
/* Same outer page gap as index.vue's .today, and for the same reason. */
.speaking { display: flex; flex-direction: column; gap: 24px; }
.toolbar { display: flex; flex-wrap: wrap; align-items: center; justify-content: space-between; gap: var(--gap-form); }
.switches { display: flex; flex-wrap: wrap; align-items: center; gap: var(--gap-form); }
.title { display: flex; flex-direction: column; gap: var(--gap-button); }
.title p { margin: 0; }
.title-hanzi { font-family: var(--fk-font-hanzi); font-size: 26px; color: var(--text-body); }
.title-sub { font: var(--font-normal-regular); color: var(--text-muted); }
</style>
