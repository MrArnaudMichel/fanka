<script setup lang="ts">
import type { DeepReadonly } from 'vue';
import { parsePinyin } from '~core/chinese/pinyin';
import type { CharacterStrokes, Point } from '~core/chinese/strokes';
import { toZhuyin } from '~core/chinese/zhuyin';
import type { Word } from '~core/curriculum/types';
import type { Settings } from '~core/db/settings';
import type HanziPad from '~/components/HanziPad.vue';
import { useStrokeData } from '~/composables/useStrokeData';
import type { StrokeOrderEntry } from '~/composables/useStrokeOrderPlayer';
import { useWritingAttempt } from '~/composables/useWritingAttempt';

/**
 * Write a lesson word from its meaning, checked as on the Writing page
 * (whole character on Check, or stroke by stroke when that setting is on).
 * With `demo` — the unit's writing session — each character's stroke order
 * plays first, and drawing starts when the learner is ready.
 *
 * Right means every character was drawn right. "I don't know" is wrong and
 * shows how the word is written. A word with a character that has no stroke
 * data cannot be checked: the learner reveals it and says whether they got it.
 */
const props = defineProps<{ word: Word; settings: DeepReadonly<Settings>; canSpeak: boolean; demo?: boolean }>();
const emit = defineEmits<{ done: [right: boolean]; speak: [text: string] }>();

const card = computed(() => {
  const first = props.word.readings[0];
  const pinyin = parsePinyin(first?.pinyin ?? '');
  return {
    hanzi: props.word.hanzi,
    pinyin,
    zhuyin: first?.zhuyin ?? toZhuyin(pinyin),
    translation: first?.meanings.join('; ') ?? '',
  };
});

const { load } = useStrokeData();
const attempt = useWritingAttempt(load, { live: () => props.settings.strokeFeedback });
const pad = ref<InstanceType<typeof HanziPad>>();
const drawn = ref<Point[][]>([]);
const gaveUp = ref(false);
const selfRevealed = ref(false);
/** The character whose demo the learner has watched, in the writing session. */
const demoSeen = ref(-1);
const continueButton = ref<HTMLElement & { updateComplete?: Promise<boolean> }>();

onMounted(() => void attempt.start(props.word.hanzi));
watch(attempt.position, () => {
  drawn.value = [];
});

const checked = computed(() => attempt.status.value === 'checked');
const revealed = computed(() => checked.value || gaveUp.value || selfRevealed.value);
const drawing = computed(() => attempt.status.value === 'drawing' && !gaveUp.value);
const demoing = computed(() => props.demo === true && drawing.value && demoSeen.value !== attempt.position.value);

async function focusContinue(): Promise<void> {
  await nextTick();
  await continueButton.value?.updateComplete;
  continueButton.value?.focus();
}
watch(revealed, (now) => {
  if (now) void focusContinue();
});

function check(): void {
  if (drawn.value.length === 0 || attempt.live.value) return;
  attempt.submit(drawn.value);
}

function onStroke(stroke: Point[]): void {
  if (!attempt.live.value) return;
  if (attempt.addStroke(stroke) === 'rejected') pad.value?.reject();
}

function undoStroke(): void {
  pad.value?.undo();
  attempt.undoStroke();
}

function clearPad(): void {
  pad.value?.clear();
  attempt.restartCharacter();
}

const hintPath = computed(() => {
  const at = attempt.hint.value;
  const model = attempt.model.value;
  return at === null || !model ? null : (model.strokes[at] ?? null);
});

/** How the word is written, after giving up. */
const answerStrokes = ref<StrokeOrderEntry[] | null>(null);
async function giveUp(): Promise<void> {
  gaveUp.value = true;
  const characters = [...props.word.hanzi];
  const models = await Promise.all(characters.map((c) => load(c)));
  if (models.some((m) => !m)) return;
  answerStrokes.value = characters.map((character, i) => ({ character, model: models[i] as CharacterStrokes, highlight: null }));
}
</script>

<template>
  <WritingCard :card="card" :revealed="revealed" :settings="settings" :can-speak="canSpeak" @speak="(t: string) => emit('speak', t)">
    <WritingVerdict v-if="checked" :attempts="attempt.attempts.value" />

    <template v-else-if="!revealed">
      <div v-if="demoing && attempt.model.value" class="pad-area">
        <span v-if="attempt.characters.value.length > 1" class="mono">
          Character {{ attempt.position.value + 1 }} / {{ attempt.characters.value.length }}
        </span>
        <StrokeOrderPlayer
          :key="attempt.position.value"
          :model="attempt.model.value"
          :character="attempt.characters.value[attempt.position.value] ?? ''"
        />
      </div>
      <div v-else-if="drawing" class="pad-area">
        <span v-if="attempt.characters.value.length > 1" class="mono">
          Character {{ attempt.position.value + 1 }} / {{ attempt.characters.value.length }}
        </span>
        <HanziPad
          ref="pad"
          :key="attempt.position.value"
          :hint="hintPath"
          @strokes-change="(strokes: Point[][]) => (drawn = strokes)"
          @stroke="onStroke"
        />
      </div>
      <p v-else-if="attempt.status.value === 'unsupported'" class="note">
        No stroke data for {{ attempt.missing.value.join(' ') }} — check yourself.
      </p>
      <kt-skeleton v-else class="pad-skeleton" height="100%" />
    </template>

    <template #answer-extra>
      <StrokeOrderPanel v-if="gaveUp && answerStrokes" :entries="answerStrokes" />
    </template>
  </WritingCard>

  <div class="fk-session-actions">
    <kt-button
      v-if="checked || gaveUp"
      ref="continueButton"
      variant="primary"
      size="large"
      full-width
      @click="emit('done', checked && attempt.correct.value)"
    >
      Continue
    </kt-button>
    <WritingButtons v-else-if="selfRevealed" :busy="false" @grade="(g) => emit('done', g === 3)" />
    <kt-button v-else-if="demoing" variant="primary" size="large" icon="pen-line" full-width @click="demoSeen = attempt.position.value">
      Start drawing
    </kt-button>
    <div v-else-if="drawing" class="pad-controls" :class="{ live: attempt.live.value }">
      <kt-button variant="secondary" size="large" icon="undo-2" label="Undo stroke" :disabled="drawn.length === 0" @click="undoStroke" />
      <kt-button variant="secondary" size="large" icon="x" label="Clear" :disabled="drawn.length === 0" @click="clearPad" />
      <kt-button variant="secondary" size="large" icon="circle-help" :fullWidth="attempt.live.value" @click="giveUp">
        I don't know
      </kt-button>
      <kt-button
        v-if="!attempt.live.value"
        variant="primary"
        size="large"
        icon="check"
        full-width
        :disabled="drawn.length === 0"
        @click="check"
      >
        Check
      </kt-button>
    </div>
    <ShowAnswerButton v-else-if="attempt.status.value === 'unsupported'" :autofocus="false" :busy="false" @reveal="selfRevealed = true" />
  </div>
</template>

<style scoped>
.pad-area { display: flex; flex-direction: column; align-items: center; gap: var(--gap-element); width: 100%; }
.pad-area, .pad-skeleton { max-width: var(--fk-pad-max); }
.pad-skeleton { width: 100%; aspect-ratio: 1; }
.mono { font: var(--font-normal-small); font-family: var(--font-family-code); color: var(--text-muted); }
.note { margin: 0; font: var(--font-normal-small); color: var(--text-muted); }
.pad-controls { display: grid; grid-template-columns: auto auto auto 1fr; gap: var(--gap-button); }
.pad-controls.live { grid-template-columns: auto auto 1fr; }
</style>
