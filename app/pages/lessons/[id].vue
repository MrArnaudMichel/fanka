<script setup lang="ts">
import { scoreLesson, writingId } from '~core/curriculum/engine';
import type { Word } from '~core/curriculum/types';
import ChoiceExercise from '~/components/lesson/ChoiceExercise.vue';
import LessonSummary from '~/components/lesson/LessonSummary.vue';
import OrderExercise from '~/components/lesson/OrderExercise.vue';
import WordIntro from '~/components/lesson/WordIntro.vue';
import WritingExercise from '~/components/lesson/WritingExercise.vue';
import { useLeaveGuard } from '~/composables/useLeaveGuard';
import { useLesson } from '~/composables/useLesson';
import { useLessons } from '~/composables/useLessons';
import { useSettings } from '~/composables/useSettings';
import { useSpeech } from '~/composables/useSpeech';

/**
 * A lesson: each word introduced in turn, then its exercises one at a time
 * with feedback, then the summary, which saves the results. A unit's writing
 * session runs on the same route without the introductions: each word is
 * written, a character at a time, after its stroke order is shown.
 *
 * Nothing is written before the summary: leaving earlier asks first, since
 * the answers so far are lost.
 */
definePageMeta({ key: (route) => route.fullPath });
const id = String(useRoute().params.id);
const lesson = useLesson(id);
const lessons = useLessons();
const { settings } = useSettings();
const { supported: canSpeak, speak } = useSpeech();

type Phase = 'loading' | 'discover' | 'exercises' | 'summary';
const phase = ref<Phase>('loading');
const discoverAt = ref(0);
const loadFailed = ref(false);
const saving = ref(false);
const saveFailed = ref(false);

const target = computed(() => lesson.target.value);
const words = computed<Word[]>(() => target.value?.words ?? []);
const wordById = computed(() => new Map(words.value.map((w) => [w.id, w])));
const currentWord = computed(() => (lesson.current.value ? (wordById.value.get(lesson.current.value.wordId) ?? null) : null));

async function load(): Promise<void> {
  loadFailed.value = false;
  phase.value = 'loading';
  try {
    await lesson.start();
  } catch (err) {
    console.error('lesson: failed to load', err);
    loadFailed.value = true;
    return;
  }
  const t = lesson.target.value;
  if (!t) return;
  discoverAt.value = 0;
  if (lesson.exercises.value.length === 0) void toSummary();
  else phase.value = t.kind === 'lesson' && t.words.length > 0 ? 'discover' : 'exercises';
}
onMounted(load);

const heading = computed(() => {
  const t = target.value;
  if (!t) return 'Lesson';
  if (t.kind === 'writing') return `Writing · Unit ${t.level.units.indexOf(t.unit) + 1}`;
  return `Lesson ${t.level.lessons.indexOf(t.lesson) + 1}`;
});

const progress = computed(() => {
  const discover = target.value?.kind === 'lesson' ? words.value.length : 0;
  const total = discover + lesson.exercises.value.length;
  if (phase.value === 'summary') return 100;
  const doneSteps = (phase.value === 'discover' ? discoverAt.value : discover) + lesson.position.value;
  return total === 0 ? 0 : (doneSteps / total) * 100;
});

function nextWord(): void {
  if (discoverAt.value < words.value.length - 1) discoverAt.value += 1;
  else phase.value = 'exercises';
}

watch(
  () => [phase.value, discoverAt.value] as const,
  ([now]) => {
    const word = words.value[discoverAt.value];
    if (now === 'discover' && word && settings.value.autoPlayAudio) void speak(word.hanzi);
  },
);

function answered(right: boolean): void {
  lesson.answer(right);
  if (lesson.done.value) void toSummary();
}

async function toSummary(): Promise<void> {
  phase.value = 'summary';
  await save();
}

async function save(): Promise<void> {
  saving.value = true;
  saveFailed.value = false;
  try {
    await lesson.finish();
    await lessons.retry();
  } catch (err) {
    console.error('lesson: failed to save', err);
    saveFailed.value = true;
  } finally {
    saving.value = false;
  }
}

const score = computed(() => scoreLesson(lesson.answers.value));
const missedWords = computed(() => score.value.missed.map((wid) => wordById.value.get(wid)).filter((w): w is Word => w !== undefined));

const nextHref = computed(() => {
  const step = lessons.next.value;
  if (!step) return null;
  const nextId = step.kind === 'lesson' ? step.lesson.id : writingId(step.unit.id);
  return nextId === id ? null : `/lessons/${nextId}`;
});

const inProgress = computed(() => phase.value === 'discover' || phase.value === 'exercises');
const guard = useLeaveGuard(inProgress);
</script>

<template>
  <div class="lesson">
    <kt-page-header :eyebrow="target?.level.name" :heading="heading" />

    <div class="progress">
      <kt-progress-bar :value="progress" label="Lesson progress" />
      <kt-button variant="secondary-no-bg" size="small" icon="x" label="Close" @click="navigateTo('/lessons')" />
    </div>

    <kt-empty-state
      v-if="loadFailed || lesson.error.value"
      icon="triangle-alert"
      heading="Couldn't load this lesson"
      description="The lesson could not be read. Check your connection and try again."
    >
      <kt-button slot="actions" variant="secondary" size="medium" icon="refresh-cw" @click="load">Retry</kt-button>
    </kt-empty-state>

    <kt-empty-state
      v-else-if="lesson.missing.value"
      icon="book-open"
      heading="Lesson not found"
      description="This lesson is not in the course."
    >
      <kt-button slot="actions" variant="secondary" size="medium" @click="navigateTo('/lessons')">Back to lessons</kt-button>
    </kt-empty-state>

    <kt-skeleton v-else-if="phase === 'loading' || !target" height="320px" />

    <template v-else-if="phase === 'discover' && words[discoverAt]">
      <WordIntro :key="words[discoverAt]!.id" :word="words[discoverAt]!" :settings="settings" :can-speak="canSpeak" @speak="speak" />
      <div class="fk-session-actions">
        <kt-button variant="primary" size="large" full-width @click="nextWord">Next</kt-button>
      </div>
    </template>

    <template v-else-if="phase === 'exercises' && lesson.current.value && currentWord">
      <WritingExercise
        v-if="lesson.current.value.kind === 'writing'"
        :key="lesson.position.value"
        :word="currentWord"
        :settings="settings"
        :can-speak="canSpeak"
        :demo="target.kind === 'writing'"
        @speak="speak"
        @done="answered"
      />
      <OrderExercise
        v-else-if="lesson.current.value.kind === 'order'"
        :key="lesson.position.value"
        :exercise="lesson.current.value"
        :word="currentWord"
        :settings="settings"
        @done="answered"
      />
      <ChoiceExercise
        v-else
        :key="lesson.position.value"
        :exercise="lesson.current.value"
        :word="currentWord"
        :settings="settings"
        :can-speak="canSpeak"
        @speak="speak"
        @done="answered"
      />
    </template>

    <LessonSummary
      v-else-if="phase === 'summary'"
      :kind="target.kind"
      :right="score.right"
      :total="score.total"
      :missed="missedWords"
      :word-count="words.length"
      :saving="saving"
      :failed="saveFailed"
      :has-next="nextHref !== null"
      @next="nextHref && navigateTo(nextHref)"
      @back="navigateTo('/lessons')"
      @retry="save"
    />

    <kt-confirm-dialog
      :open="guard.asking.value"
      heading="Leave this lesson?"
      message="Your answers won't be saved."
      confirm-label="Leave"
      cancel-label="Stay"
      variant="danger"
      @kt-confirm="guard.leave()"
      @kt-cancel="guard.stay()"
    />
  </div>
</template>

<style scoped>
.lesson { display: flex; flex-direction: column; gap: var(--gap-card); }
.progress { display: flex; align-items: center; gap: var(--gap-button); }
.progress kt-progress-bar { flex: 1; }
</style>
