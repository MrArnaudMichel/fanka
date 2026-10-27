<script setup lang="ts">
import { findRadical, RADICAL_GROUPS, RADICALS, type RadicalGroup, radicalForms } from '~core/radicals';
import { buildQuiz, QUIZ_KINDS, type QuizKind, type QuizQuestion } from '~core/radicals/quiz';

/**
 * Multiple-choice rounds on the radicals: meaning from radical, radical from
 * meaning, or the radical a character is filed under. Missed radicals can be
 * drilled again at the end. Nothing here is scheduled or saved.
 */
defineProps<{ canSpeak: boolean }>();
const emit = defineEmits<{ speak: [text: string]; open: [radicalId: string] }>();

type KindChoice = QuizKind | 'mixed';

const KIND_OPTIONS: { value: KindChoice; label: string }[] = [
  { value: 'mixed', label: 'Mixed' },
  { value: 'meaning', label: 'Meaning' },
  { value: 'form', label: 'Radical' },
  { value: 'spot', label: 'In a character' },
];
const KIND_PROMPTS: Record<QuizKind, string> = {
  meaning: 'What does this radical mean?',
  form: 'Which radical means this?',
  spot: 'Which radical is this character filed under?',
};
const GROUP_OPTIONS = [{ id: 'all', label: 'All radicals' }, ...RADICAL_GROUPS.map((g) => ({ id: g.id, label: g.label }))];
const LENGTH_OPTIONS = [10, 20, 40].map((n) => ({ value: n, label: String(n) }));

const kind = ref<KindChoice>('mixed');
const group = ref<RadicalGroup | 'all'>('all');
const length = ref(10);

const phase = ref<'setup' | 'running' | 'done'>('setup');
const questions = ref<QuizQuestion[]>([]);
const index = ref(0);
const chosen = ref<number | null>(null);
const score = ref(0);
const missed = ref<string[]>([]);

const current = computed(() => questions.value[index.value]);
const radical = computed(() => (current.value ? findRadical(current.value.radicalId) : undefined));
const correct = computed(() => chosen.value !== null && chosen.value === current.value?.answer);

function start(targets = RADICALS.filter((r) => group.value === 'all' || r.group === group.value), count = length.value): void {
  const kinds = kind.value === 'mixed' ? QUIZ_KINDS : [kind.value];
  questions.value = buildQuiz(targets, RADICALS, { kinds, length: count });
  index.value = 0;
  chosen.value = null;
  score.value = 0;
  missed.value = [];
  phase.value = 'running';
}

function retryMissed(): void {
  const targets = missed.value.map(findRadical).filter((r) => r !== undefined);
  start(targets, targets.length);
}

function choose(i: number): void {
  if (chosen.value !== null || !current.value) return;
  chosen.value = i;
  if (i === current.value.answer) score.value += 1;
  else if (!missed.value.includes(current.value.radicalId)) missed.value.push(current.value.radicalId);
}

function next(): void {
  if (index.value + 1 >= questions.value.length) {
    phase.value = 'done';
    return;
  }
  index.value += 1;
  chosen.value = null;
}

const missedRadicals = computed(() => missed.value.map(findRadical).filter((r) => r !== undefined));
</script>

<template>
  <div class="quiz">
    <kt-card v-if="phase === 'setup'">
      <p slot="header" class="overline">New round</p>
      <div class="setup">
        <kt-label-input label="Question">
          <kt-segmented-control label="Question" :options="KIND_OPTIONS" :value="kind" @kt-change="(e: CustomEvent) => (kind = e.detail.value)" />
        </kt-label-input>
        <kt-label-input label="Radicals">
          <kt-select :options="GROUP_OPTIONS" :value="group" :clearable="false" @kt-change="(e: CustomEvent) => e.detail.value && (group = e.detail.value)" />
        </kt-label-input>
        <kt-label-input label="Questions">
          <kt-segmented-control label="Questions" :options="LENGTH_OPTIONS" :value="length" @kt-change="(e: CustomEvent) => (length = e.detail.value)" />
        </kt-label-input>
        <kt-button variant="primary" size="large" icon="play" @click="start()">Start</kt-button>
      </div>
    </kt-card>

    <ChoiceQuestion
      v-else-if="phase === 'running' && current"
      :index="index"
      :count="questions.length"
      :score="score"
      :ask="KIND_PROMPTS[current.kind]"
      :prompt="current.prompt"
      :prompt-hanzi="current.hanziPrompt"
      :detail="current.detail"
      :detail-after="current.kind !== 'spot'"
      :spoken="current.spoken"
      :can-speak="canSpeak"
      :choices="current.choices"
      :answer="current.answer"
      :chosen="chosen"
      :hanzi-choices="current.hanziChoices"
      @choose="choose"
      @speak="(text: string) => emit('speak', text)"
      @next="next"
    >
      <template v-if="radical">
        <kt-alert
          :variant="correct ? 'success' : 'danger'"
          :heading="correct ? 'Correct' : `It is ${radicalForms(radical).join(' ')}`"
          :description="`${radical.pinyin} · ${radical.meaning}`"
        />
        <div class="after">
          <kt-button variant="secondary-no-bg" icon="info" @click="emit('open', current.radicalId)">See radical</kt-button>
          <kt-button variant="primary" :icon="index + 1 >= questions.length ? 'check' : 'chevron-right'" @click="next">
            {{ index + 1 >= questions.length ? 'See results' : 'Next' }}
          </kt-button>
        </div>
      </template>
    </ChoiceQuestion>

    <kt-card v-else-if="phase === 'done'">
      <p slot="header" class="overline">Results</p>
      <div class="results">
        <kt-stat label="Score" :value="`${score} / ${questions.length}`" :caption="`${Math.round((score / questions.length) * 100)}% right`" />
        <template v-if="missedRadicals.length > 0">
          <p class="ask">To work on</p>
          <div class="missed">
            <kt-button v-for="r in missedRadicals" :key="r.number" variant="secondary" @click="emit('open', `kangxi-${r.number}`)">
              {{ radicalForms(r).join(' ') }} · {{ r.meaning }}
            </kt-button>
          </div>
        </template>
        <p v-else class="ask">No mistakes. Well done.</p>
        <div class="after">
          <kt-button v-if="missedRadicals.length > 0" variant="primary" icon="rotate-ccw" @click="retryMissed">Retry missed</kt-button>
          <kt-button :variant="missedRadicals.length > 0 ? 'secondary' : 'primary'" icon="play" @click="phase = 'setup'">New round</kt-button>
        </div>
      </div>
    </kt-card>
  </div>
</template>

<style scoped>
.quiz { display: flex; flex-direction: column; gap: var(--gap-card); }
.overline { margin: 0; font: var(--font-title-overline); letter-spacing: var(--letter-spacing-overline); text-transform: uppercase; color: var(--text-muted); }
.setup, .results { display: flex; flex-direction: column; gap: var(--gap-form); align-items: flex-start; }
.ask { margin: 0; font: var(--font-normal-regular); color: var(--text-muted); }
.after, .missed { display: flex; flex-wrap: wrap; gap: var(--gap-button); }
.after { justify-content: flex-end; width: 100%; }
</style>
