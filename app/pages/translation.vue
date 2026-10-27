<script setup lang="ts">
import { toaster } from 'kanto-ds';
import { buildDrill, type DrillDirection, type DrillQuestion } from '~core/translation/drill';

/**
 * Meanings only: a word's translation from its hanzi, or its hanzi from its
 * translation, out of four choices. Scope is one lesson (`?lesson=` presets
 * it and starts straight away) or the studied decks. Answers count as
 * practice; nothing here moves the schedule.
 */
definePageMeta({ key: (route) => route.fullPath });

const STUDIED = '__studied';
type DirectionChoice = DrillDirection | 'mixed';

const DIRECTION_OPTIONS: { value: DirectionChoice; label: string }[] = [
  { value: 'meaning', label: 'Hanzi to English' },
  { value: 'hanzi', label: 'English to hanzi' },
  { value: 'mixed', label: 'Both' },
];
const LENGTH_OPTIONS = [
  { value: 10, label: '10' },
  { value: 20, label: '20' },
  { value: 0, label: 'Every word' },
];
const ASK: Record<DrillDirection, string> = {
  meaning: 'What does this mean?',
  hanzi: 'Which word means this?',
};

const route = useRoute();
const presetLesson = typeof route.query.lesson === 'string' ? route.query.lesson : null;

const { words, lessons, loadLessons, load, answer } = useTranslationDrill();
const { supported: canSpeak, speak } = useSpeech();
const { settings } = useSettings();

const scope = ref(presetLesson ?? STUDIED);
const direction = ref<DirectionChoice>('meaning');
const length = ref(presetLesson ? 0 : 10);
const scopeOptions = computed(() => [{ id: STUDIED, label: 'Decks you study' }, ...lessons.value.map((l) => ({ id: l, label: l }))]);

const phase = ref<'setup' | 'loading' | 'running' | 'done'>('setup');
const questions = ref<DrillQuestion[]>([]);
const index = ref(0);
const chosen = ref<number | null>(null);
const score = ref(0);
const missed = ref<string[]>([]);
const shownAt = ref(Date.now());
const empty = ref(false);

const current = computed(() => questions.value[index.value]);
const word = computed(() => words.value.find((w) => w.id === current.value?.cardId));
const correct = computed(() => chosen.value !== null && chosen.value === current.value?.answer);
const missedWords = computed(() => missed.value.map((id) => words.value.find((w) => w.id === id)).filter((w) => w !== undefined));

function begin(targetIds?: readonly string[]): void {
  const pool = words.value;
  const targets = targetIds ? pool.filter((w) => targetIds.includes(w.id)) : pool;
  const count = targetIds ? targets.length : length.value === 0 ? targets.length : length.value;
  const directions: DrillDirection[] = direction.value === 'mixed' ? ['meaning', 'hanzi'] : [direction.value];
  questions.value = buildDrill(targets, pool, { directions, length: count });
  empty.value = questions.value.length === 0;
  index.value = 0;
  chosen.value = null;
  score.value = 0;
  missed.value = [];
  shownAt.value = Date.now();
  phase.value = empty.value ? 'setup' : 'running';
}

async function start(): Promise<void> {
  phase.value = 'loading';
  try {
    await load(scope.value === STUDIED ? null : scope.value);
  } catch (err) {
    console.error('translation: could not load the words', err);
    toaster.error("Couldn't load the words", { description: 'Try again.' });
    phase.value = 'setup';
    return;
  }
  begin();
}

async function choose(i: number): Promise<void> {
  const q = current.value;
  if (chosen.value !== null || !q) return;
  chosen.value = i;
  const right = i === q.answer;
  if (right) score.value += 1;
  else if (!missed.value.includes(q.cardId)) missed.value.push(q.cardId);
  if (settings.value.autoPlayAudio && word.value) void speak(word.value.hanzi);
  try {
    await answer(q.cardId, right, Date.now() - shownAt.value);
  } catch (err) {
    console.error('translation: could not log the answer', err);
  }
}

function next(): void {
  if (index.value + 1 >= questions.value.length) {
    phase.value = 'done';
    return;
  }
  index.value += 1;
  chosen.value = null;
  shownAt.value = Date.now();
}

onMounted(async () => {
  await loadLessons();
  if (presetLesson && lessons.value.includes(presetLesson)) await start();
  else if (presetLesson) scope.value = STUDIED;
});
</script>

<template>
  <div class="translation">
    <kt-page-header eyebrow="Practice" heading="Translation" description="Meanings only: match each word to its translation, or the other way round. Answers count as practice and never change the schedule." />

    <kt-card v-if="phase === 'setup' || phase === 'loading'">
      <p slot="header" class="overline">New round</p>
      <div class="setup">
        <kt-label-input label="Words from">
          <kt-select :options="scopeOptions" :value="scope" :clearable="false" @kt-change="(e: CustomEvent) => e.detail.value && (scope = e.detail.value)" />
        </kt-label-input>
        <kt-label-input label="Direction">
          <kt-segmented-control label="Direction" :options="DIRECTION_OPTIONS" :value="direction" @kt-change="(e: CustomEvent) => (direction = e.detail.value)" />
        </kt-label-input>
        <kt-label-input label="Questions">
          <kt-segmented-control label="Questions" :options="LENGTH_OPTIONS" :value="length" @kt-change="(e: CustomEvent) => (length = e.detail.value)" />
        </kt-label-input>
        <kt-alert v-if="empty" variant="warning" description="Not enough words with different meanings here. Pick another lesson or study more decks." />
        <kt-button variant="primary" size="large" icon="play" :disabled="phase === 'loading'" @click="start">Start</kt-button>
      </div>
    </kt-card>

    <ChoiceQuestion
      v-else-if="phase === 'running' && current"
      :index="index"
      :count="questions.length"
      :score="score"
      :ask="ASK[current.direction]"
      :prompt="current.prompt"
      :prompt-hanzi="current.direction === 'meaning'"
      :detail="word?.pinyin"
      :detail-after="true"
      :spoken="current.direction === 'meaning' ? current.prompt : null"
      :can-speak="canSpeak"
      :choices="current.choices"
      :answer="current.answer"
      :chosen="chosen"
      :hanzi-choices="current.direction === 'hanzi'"
      @choose="choose"
      @speak="speak"
      @next="next"
    >
      <kt-alert
        v-if="word"
        :variant="correct ? 'success' : 'danger'"
        :heading="correct ? 'Correct' : current.direction === 'meaning' ? `It means ${word.translation}` : `It is ${word.hanzi}`"
        :description="`${word.hanzi} · ${word.pinyin} · ${word.translation}`"
      />
      <div class="after">
        <kt-button v-if="word" variant="secondary-no-bg" icon="volume-2" :disabled="!canSpeak" @click="speak(word.hanzi)">Listen</kt-button>
        <kt-button variant="primary" :icon="index + 1 >= questions.length ? 'check' : 'chevron-right'" @click="next">
          {{ index + 1 >= questions.length ? 'See results' : 'Next' }}
        </kt-button>
      </div>
    </ChoiceQuestion>

    <kt-card v-else-if="phase === 'done'">
      <p slot="header" class="overline">Results</p>
      <div class="results">
        <kt-stat label="Score" :value="`${score} / ${questions.length}`" :caption="`${Math.round((score / questions.length) * 100)}% right`" />
        <template v-if="missedWords.length > 0">
          <p class="muted">To work on</p>
          <kt-description-list label="Missed words" :items="missedWords.map((w) => ({ term: `${w.hanzi} ${w.pinyin}`, detail: w.translation }))" />
        </template>
        <p v-else class="muted">No mistakes. Well done.</p>
        <div class="after">
          <kt-button v-if="missedWords.length > 0" variant="primary" icon="rotate-ccw" @click="begin(missed)">Retry missed</kt-button>
          <kt-button :variant="missedWords.length > 0 ? 'secondary' : 'primary'" icon="play" @click="phase = 'setup'">New round</kt-button>
        </div>
      </div>
    </kt-card>
  </div>
</template>

<style scoped>
.translation { display: flex; flex-direction: column; gap: 24px; }
.overline { margin: 0; font: var(--font-title-overline); letter-spacing: var(--letter-spacing-overline); text-transform: uppercase; color: var(--text-muted); }
.setup, .results { display: flex; flex-direction: column; gap: var(--gap-form); align-items: flex-start; }
.results kt-description-list { width: 100%; }
.muted { margin: 0; font: var(--font-normal-regular); color: var(--text-muted); }
.after { display: flex; flex-wrap: wrap; gap: var(--gap-button); justify-content: flex-end; width: 100%; }
</style>
