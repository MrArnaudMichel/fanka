<script setup lang="ts">
import { toaster } from 'kanto-ds';
import type { CharacterStrokes, Point } from '~core/chinese/strokes';
import type { Grade } from '~core/srs/types';
import type HanziPad from '~/components/HanziPad.vue';
import { useDueCounts } from '~/composables/useDueCounts';
import { usePracticeSession } from '~/composables/usePracticeSession';
import { focusCardIds } from '~/utils/focus';
import { useWritingRetry } from '~/composables/useWritingRetry';
import { SELF_GRADED, useReviewSession } from '~/composables/useReviewSession';
import { useSettings } from '~/composables/useSettings';
import { useSpeech } from '~/composables/useSpeech';
import { useStrokeData } from '~/composables/useStrokeData';
import type { StrokeOrderEntry } from '~/composables/useStrokeOrderPlayer';
import { useWritingAttempt } from '~/composables/useWritingAttempt';

/**
 * Writing practice works through production items in its own session (see
 * `SessionMode`): the learner draws each character, the app checks the
 * strokes against the Make Me a Hanzi data, and the verdict sets the grade.
 *
 * Three ways a card can be answered, in the order the template tries them:
 * - drawn and checked (`attempt.status === 'checked'`): two verdicts (the
 *   character, which sets the grade, and the stroke order, which is only
 *   logged), the stroke-order player, then Continue;
 * - given up ("I don't know"): the answer and the stroke-order player, then
 *   Continue, which grades Again;
 * - revealed without a check — a character has no stroke data, or an undo
 *   brought back a card graded earlier, whose drawing is gone: the answer,
 *   then Right / Wrong as before;
 * - otherwise the pad, one character at a time.
 *
 * With stroke-by-stroke feedback on (the default), there is no Check: each
 * stroke is checked as it ends, a wrong one flashes and is taken back off
 * the pad, and the verdict follows the word's last stroke. Every character
 * so drawn is right, so Continue grades Good — or Hard when a hint (the
 * expected stroke, shown after three misses in a row) was needed.
 */
/**
 * `?endless=1` (from the Practice page) runs the same screen on an endless,
 * unscheduled session instead: nothing is graded into the schedule, there is
 * no progress to show and nothing to undo. Keyed on the full path so moving
 * between the two modes remounts the page rather than keeping the old session.
 */
definePageMeta({ key: (route) => route.fullPath });
const endless = useRoute().query.endless === '1';
/** `?cards=` from Statistics' "Practise these": endless practice on those cards only. */
const focus = endless ? focusCardIds(useRoute().query.cards) : undefined;
const practice = endless ? usePracticeSession('writing', { cardIds: focus }) : null;
const session = practice ?? useReviewSession('writing');
const redraw = useWritingRetry();
const { settings } = useSettings();
const { refresh } = useDueCounts();

// Speaking is the page's job so the P key, auto-play and the card's buttons
// share one engine and cancel each other.
const { supported: canSpeak, speak } = useSpeech();
watch(
  () => session.revealed.value,
  (now, before) => {
    if (now && !before && settings.value.autoPlayAudio && session.card.value) void speak(session.card.value.hanzi);
  },
);
const { load: loadStrokes } = useStrokeData();
const attempt = useWritingAttempt(loadStrokes, { live: () => settings.value.strokeFeedback });

const loading = ref(true);
const hasGraded = ref(false);
const loadError = ref(false);
const retried = ref(false);

const pad = ref<InstanceType<typeof HanziPad>>();
const drawn = ref<Point[][]>([]);

async function load(): Promise<void> {
  loading.value = true;
  loadError.value = false;
  try {
    if (!(await session.restore())) await session.start();
  } catch (err) {
    console.error('writing: failed to load the session', err);
    loadError.value = true;
  } finally {
    loading.value = false;
  }
}

async function retry(): Promise<void> {
  retried.value = true;
  await load();
}

const cardMissing = computed(() => !session.busy.value && session.current.value !== null && session.card.value === null);

/**
 * A new card on screen gets a fresh attempt; a card that arrives already
 * revealed (after an undo) gets none — its drawing was not kept, so it is
 * graded by hand.
 *
 * Watches `revealed` as well as the ids, and remembers which item the
 * attempt belongs to: after a grade, the next card's id lands a beat before
 * the session resets `revealed` for it, so a watcher on the ids alone would
 * see the new card still "revealed" and never start its attempt.
 */
let attemptFor: string | null = null;
watch(
  () => [session.current.value?.id, session.card.value?.id, session.revealed.value] as const,
  (_now, [, , wasRevealed]) => {
    const card = session.card.value;
    const item = session.current.value;
    // The same item drawn again — endless practice on a single card — comes
    // back unrevealed: that is a new attempt, not the one already checked.
    if (wasRevealed && !session.revealed.value) attemptFor = null;
    if (!card || !item || item.cardId !== card.id) {
      attemptFor = null;
      redraw.clear();
      attempt.reset();
      return;
    }
    if (attemptFor === item.id) return;
    redraw.clear();
    if (session.revealed.value) {
      attempt.reset();
      return;
    }
    attemptFor = item.id;
    drawn.value = [];
    void attempt.start(card.hanzi);
  },
);

// Each character gets a fresh pad (keyed on position), so what was drawn
// for the previous one is gone too.
watch(attempt.position, () => {
  drawn.value = [];
});

function check(): void {
  if (drawn.value.length === 0 || session.busy.value || attempt.live.value) return;
  attempt.submit(drawn.value);
  if (attempt.status.value === 'checked') session.reveal();
}

/** Stroke-by-stroke feedback: each stroke is checked as the pad lets go of it. */
function onStroke(stroke: Point[]): void {
  if (!attempt.live.value) return;
  if (attempt.addStroke(stroke) === 'rejected') pad.value?.reject();
  else if (attempt.status.value === 'checked') session.reveal();
}

function undoStroke(): void {
  pad.value?.undo();
  attempt.undoStroke();
}

function clearPad(): void {
  pad.value?.clear();
  attempt.restartCharacter();
}

/** The expected stroke's outline, once the learner has missed it three times running. */
const hintPath = computed(() => {
  const at = attempt.hint.value;
  const model = attempt.model.value;
  return at === null || !model ? null : (model.strokes[at] ?? null);
});

/** A checked drawing's grade when right: stroke-by-stroke, a hint makes it Hard. */
const rightGrade = computed<Grade>(() => (attempt.live.value && attempt.hintsUsed.value ? 2 : 3));

/**
 * "I don't know": the learner gives up on the card before checking. It is
 * cleared whenever another item comes on screen — including the same item
 * brought back by an undo, which returns revealed and is self-graded.
 */
const gaveUp = ref(false);
watch(
  () => [session.current.value?.id, session.revealed.value] as const,
  ([id, revealed], [previousId]) => {
    if (id !== previousId || !revealed) gaveUp.value = false;
  },
);

function giveUp(): void {
  if (session.busy.value || attempt.status.value !== 'drawing') return;
  gaveUp.value = true;
  session.reveal();
}

const checked = computed(() => session.revealed.value && attempt.status.value === 'checked');
/** Redrawing after the verdict: the pad is back, the answer hidden again. */
const redrawing = computed(() => session.revealed.value && redraw.retrying.value);
const unchecked = computed(() => session.revealed.value && attempt.status.value !== 'checked' && !redraw.retrying.value);

/**
 * The first check of a card sets its grade; each retry's check is logged as
 * practice instead (see `useWritingRetry`).
 */
watch(checked, (isChecked) => {
  if (!isChecked) return;
  const item = session.current.value;
  if (redraw.retrying.value && item) {
    redraw.logRetry(item, attempt.results.value).catch((err: unknown) => {
      console.error('writing: failed to log the retry', err);
    });
  } else {
    redraw.keepFirst(attempt.correct.value, rightGrade.value, attempt.results.value);
  }
});
/** What Continue and Enter grade: the first try, even after a retry. */
const firstCorrect = computed(() => redraw.first.value?.correct ?? attempt.correct.value);
const firstRightGrade = computed<Grade>(() => redraw.first.value?.rightGrade ?? rightGrade.value);

function startRetry(): void {
  const card = session.card.value;
  if (!card || session.busy.value || !checked.value) return;
  redraw.start();
  drawn.value = [];
  void attempt.start(card.hanzi);
}
const givenUp = computed(() => unchecked.value && gaveUp.value);
const selfGraded = computed(() => unchecked.value && !gaveUp.value);

/**
 * An answer shown without a check (given up, after an undo, or with no
 * stroke data to check against) still shows how its characters are
 * written, when every one has stroke data.
 */
const answerStrokes = ref<StrokeOrderEntry[] | null>(null);
watch(
  () => [unchecked.value, session.card.value?.hanzi] as const,
  async ([on, hanzi]) => {
    answerStrokes.value = null;
    if (!on || !hanzi) return;
    const characters = [...hanzi];
    const models = await Promise.all(characters.map((c) => loadStrokes(c)));
    if (!unchecked.value || session.card.value?.hanzi !== hanzi) return;
    if (models.some((m) => !m)) return;
    answerStrokes.value = characters.map((character, i) => ({ character, model: models[i] as CharacterStrokes, highlight: null }));
  },
);

onMounted(async () => {
  window.addEventListener('keydown', onKey);
  await load();
});
onUnmounted(() => window.removeEventListener('keydown', onKey));

async function grade(value: Grade) {
  hasGraded.value = true;
  const first = redraw.first.value;
  const detail = first ? { checked: true, writing: [...first.results] } : checked.value ? { checked: true, writing: [...attempt.results.value] } : SELF_GRADED;
  try {
    await session.grade(value, detail);
  } catch (err) {
    console.error('writing: failed to save the grade', err);
    toaster.error("Couldn't save that answer", { description: 'Try again.' });
    return;
  }
  if (!endless) await refresh();
}

async function undo() {
  try {
    await session.undo();
  } catch (err) {
    console.error('writing: failed to undo', err);
    toaster.error("Couldn't undo that grade", { description: 'Try again.' });
  }
}

function onKey(event: KeyboardEvent) {
  const target = event.target as HTMLElement | null;
  const tag = target?.tagName;
  if (tag === 'INPUT' || tag === 'TEXTAREA' || target?.isContentEditable) return;
  if (event.metaKey || event.ctrlKey || event.altKey) return;
  if (session.busy.value) return;

  if (checked.value) {
    if (event.key === 'Enter' || event.code === 'Space') {
      event.preventDefault();
      void grade(firstCorrect.value ? firstRightGrade.value : 1);
    } else if (event.key.toLowerCase() === 'r') {
      event.preventDefault();
      startRetry();
    }
  } else if (givenUp.value) {
    if (event.key === 'Enter' || event.code === 'Space') {
      event.preventDefault();
      void grade(1);
    }
  } else if (selfGraded.value) {
    if (event.code === 'Space' || event.key === 'Enter') {
      event.preventDefault();
      void grade(3);
    } else if (event.key.toLowerCase() === 'x') {
      event.preventDefault();
      void grade(1);
    }
  } else if (attempt.status.value === 'drawing') {
    if (event.key === 'Enter' && !attempt.live.value) {
      event.preventDefault();
      check();
    } else if (event.key.toLowerCase() === 'n' && !redrawing.value) {
      event.preventDefault();
      giveUp();
    }
  } else if (attempt.status.value === 'unsupported' && (event.code === 'Space' || event.key === 'Enter')) {
    event.preventDefault();
    session.reveal();
  }

  if (session.revealed.value && event.key.toLowerCase() === 'p' && !event.defaultPrevented) {
    event.preventDefault();
    if (session.card.value) void speak(session.card.value.hanzi);
  }

  if (event.key.toLowerCase() === 'u' && !event.defaultPrevented) {
    event.preventDefault();
    void undo();
  }
}

const progress = computed(() => (session.total.value === 0 ? 0 : (session.index.value / session.total.value) * 100));
</script>

<template>
  <div class="writing">
    <kt-page-header :eyebrow="endless ? 'Endless practice' : undefined" heading="Writing" />
    <FocusBanner v-if="practice && focus" :count="practice.total.value" />

    <!--
      Undo and Leave sit with the count rather than in the page header's
      actions: at phone width kt-page-header wraps its actions onto a row
      of their own, which cost a card's worth of height for two icons.
    -->
    <div v-if="practice" class="progress-row">
      <span class="mono">{{ practice.seen.value }} seen · {{ practice.right.value }} right</span>
      <kt-button variant="secondary-no-bg" size="small" icon="x" label="Leave practice" @click="navigateTo('/practice')" />
    </div>

    <div v-else class="progress">
      <div class="progress-row">
        <span class="mono">{{ session.position.value }} / {{ session.total.value }}</span>
        <span class="session-actions">
          <kt-button
            variant="secondary-no-bg"
            size="small"
            icon="undo-2"
            label="Undo"
            :disabled="session.busy.value || session.log.value.length === 0"
            @click="undo"
          />
          <kt-button
            variant="secondary-no-bg"
            size="small"
            icon="x"
            label="Leave session"
            @click="navigateTo('/')"
          />
        </span>
      </div>
      <kt-progress-bar :value="progress" label="Session progress" />
    </div>

    <kt-skeleton v-if="loading" height="320px" />

    <kt-empty-state
      v-else-if="loadError || cardMissing"
      icon="triangle-alert"
      heading="Couldn't load this session"
      description="Something went wrong reading the database. Try again."
    >
      <kt-button slot="actions" variant="secondary" size="medium" icon="refresh-cw" @click="retry">Retry</kt-button>
    </kt-empty-state>

    <kt-empty-state
      v-else-if="practice && session.total.value === 0"
      icon="layers"
      heading="Nothing to practise"
      description="The decks you study have no cards yet. Add cards, or pick other decks to study."
    />

    <kt-empty-state
      v-else-if="session.total.value === 0"
      icon="check"
      heading="Nothing due"
      description="Everything scheduled for today is done. Come back tomorrow, or add cards."
    />

    <kt-card v-else-if="session.ended.value" class="done">
      <div class="done-body">
        <span class="seal">完</span>
        <h2>Session complete</h2>
        <p>{{ session.log.value.length }} cards graded.</p>
        <kt-button variant="primary" size="medium" icon="house" @click="navigateTo('/')">Back to today</kt-button>
      </div>
    </kt-card>

    <template
      v-else-if="session.card.value && session.current.value && session.card.value.id === session.current.value.cardId"
    >
      <WritingCard
        :card="session.card.value"
        :revealed="session.revealed.value && !redrawing"
        :settings="settings"
        :can-speak="canSpeak"
        @speak="speak"
      >
        <template v-if="checked">
          <p v-if="redraw.retries.value > 0 && redraw.first.value" class="note">
            Graded on your first try: {{ redraw.first.value.correct ? 'Right' : 'Wrong' }}. Retries are practice.
          </p>
          <WritingVerdict :attempts="attempt.attempts.value" />
        </template>

        <template v-else-if="!session.revealed.value || redrawing">
          <div v-if="attempt.status.value === 'drawing'" class="pad-area">
            <span v-if="attempt.characters.value.length > 1" class="mono">
              Character {{ attempt.position.value + 1 }} / {{ attempt.characters.value.length }}
        </span>
            <HanziPad
              ref="pad"
              :key="`${session.current.value.id}:${attempt.position.value}`"
              :hint="hintPath"
              @strokes-change="(strokes: Point[][]) => (drawn = strokes)"
              @stroke="onStroke"
            />
          </div>
          <p v-else-if="attempt.status.value === 'unsupported'" class="note">
            No stroke data for {{ attempt.missing.value.join(' ') }} — grade yourself.
          </p>
          <kt-skeleton v-else class="pad-skeleton" height="100%" />
        </template>

        <template #answer-extra>
          <StrokeOrderPanel v-if="answerStrokes" :entries="answerStrokes" />
        </template>
      </WritingCard>

      <div class="actions fk-session-actions">
        <VerdictButtons
          v-if="checked"
          :correct="firstCorrect"
          :right-grade="firstRightGrade"
          :busy="session.busy.value"
          @grade="grade"
          @retry="startRetry"
        />
        <kt-button
          v-else-if="givenUp"
          variant="primary"
          size="large"
          full-width
          :disabled="session.busy.value"
          @click="grade(1)"
        >
          Continue
        </kt-button>
        <WritingButtons v-else-if="selfGraded" :busy="session.busy.value" @grade="grade" />
        <div v-else-if="attempt.status.value === 'drawing'" class="pad-controls" :class="{ live: attempt.live.value }">
          <kt-button variant="secondary" size="large" icon="undo-2" label="Undo stroke" :disabled="drawn.length === 0" @click="undoStroke" />
          <kt-button variant="secondary" size="large" icon="x" label="Clear" :disabled="drawn.length === 0" @click="clearPad" />
          <kt-button
            v-if="!redrawing"
            variant="secondary"
            size="large"
            icon="circle-help"
            :fullWidth="attempt.live.value"
            :disabled="session.busy.value"
            @click="giveUp"
          >
            I don't know
          </kt-button>
          <kt-button
            v-if="!attempt.live.value"
            variant="primary"
            size="large"
            icon="check"
            full-width
            :disabled="drawn.length === 0 || session.busy.value"
            @click="check"
          >
            Check
          </kt-button>
        </div>
        <ShowAnswerButton
          v-else-if="attempt.status.value === 'unsupported'"
          :autofocus="hasGraded || retried"
          :busy="session.busy.value"
          @reveal="session.reveal()"
        />
        <p v-if="selfGraded" class="hints fk-keyboard-only">
          <kt-kbd>Space</kt-kbd> right <kt-kbd>X</kt-kbd> wrong <kt-kbd>P</kt-kbd> play <kt-kbd>U</kt-kbd> undo
        </p>
        <p v-else-if="checked || givenUp" class="hints fk-keyboard-only"><kt-kbd>Enter</kt-kbd> continue <kt-kbd>P</kt-kbd> play <kt-kbd>U</kt-kbd> undo</p>
        <p v-else-if="attempt.status.value === 'drawing' && attempt.live.value" class="hints fk-keyboard-only">
          <kt-kbd>N</kt-kbd> don't know
        </p>
        <p v-else-if="attempt.status.value === 'drawing'" class="hints fk-keyboard-only">
          <kt-kbd>Enter</kt-kbd> check <kt-kbd>N</kt-kbd> don't know
        </p>
      </div>
    </template>

    <kt-skeleton v-else height="320px" />
  </div>
</template>

<style scoped>
.writing { display: flex; flex-direction: column; gap: var(--gap-card); }
.progress { display: flex; flex-direction: column; gap: 6px; }
.progress-row { display: flex; align-items: center; justify-content: space-between; }
.session-actions { display: flex; gap: var(--gap-button); }
.mono { font: var(--font-normal-small); font-family: var(--font-family-code); color: var(--text-muted); }
.done-body { display: flex; flex-direction: column; align-items: center; gap: 24px; text-align: center; }
.seal { font-family: var(--fk-font-hanzi-serif); font-size: 56px; color: var(--color-primary-base); }
.done-body h2 { margin: 0; font: var(--font-title-h1); color: var(--text-body); }
.done-body p { margin: 0; color: var(--text-muted); }
.pad-area { display: flex; flex-direction: column; align-items: center; gap: var(--gap-element); width: 100%; }
/*
  Wide enough to draw in comfortably, never so tall that the sticky action
  bar covers the pad's lower edge — a stroke started there would land on
  the bar, not the pad. 440px is roughly everything else on screen (header,
  title, progress, prompt, actions); no token measures that. Never below
  200px, where a character stops being drawable.
*/
.pad-area, .pad-skeleton { max-width: min(100%, 420px, max(200px, calc(100dvh - 440px))); }
.pad-skeleton { width: 100%; aspect-ratio: 1; }
.note { margin: 0; font: var(--font-normal-small); color: var(--text-muted); }
.pad-controls { display: grid; grid-template-columns: auto auto auto 1fr; gap: var(--gap-button); }
.pad-controls.live { grid-template-columns: auto auto 1fr; }
.hints {
  display: flex;
  justify-content: center;
  align-items: center;
  gap: 6px;
  margin: 0;
  font: var(--font-normal-small);
  color: var(--text-muted);
}
</style>
