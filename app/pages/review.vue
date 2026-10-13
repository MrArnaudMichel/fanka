<script setup lang="ts">
import { toaster } from 'kanto-ds';
import { useDueCounts } from '~/composables/useDueCounts';
import { usePracticeSession } from '~/composables/usePracticeSession';
import { focusCardIds } from '~/utils/focus';
import { useReviewSession } from '~/composables/useReviewSession';
import { useSettings } from '~/composables/useSettings';
import { useSpeech } from '~/composables/useSpeech';
import type { Grade } from '~core/srs/types';

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
const practice = endless ? usePracticeSession('review', { cardIds: focus }) : null;
const session = practice ?? useReviewSession('review');
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

/**
 * The composable exposes no "has start()/restore() settled yet" flag —
 * only `ended`, which is also true for a *started* session sitting on an
 * empty queue. Loading is tracked locally so the loading skeleton can be
 * told apart from "nothing due", which also has `total === 0` but is a
 * settled state, not a pending one.
 */
const loading = ref(true);

/**
 * Whether the learner has graded at least one card in this page instance.
 * `ShowAnswerButton` uses this to tell "the very first card of a page load
 * (including a reload that resumes mid-session on an unrevealed card)" —
 * where it must not steal focus — from "a new card just replaced the one
 * the learner graded" — where it should, the same way `GradeButtons`
 * already does for the reveal direction.
 */
const hasGraded = ref(false);

/**
 * `restore()` or `start()` can genuinely reject — quota exceeded, Safari
 * private browsing, a blocked `versionchange` — the same failures the Today
 * page's `loadToday` handles. `loading` is cleared in `finally` so a
 * rejection can never leave the skeleton showing forever with no way out.
 */
const loadError = ref(false);

/**
 * Whether the Retry button (not the initial `onMounted` load) is what most
 * recently triggered `load()`. Set *before* awaiting, same reasoning as
 * `hasGraded` above: it only needs to be true by the time `load()`'s
 * success re-renders the page into the unrevealed-card branch, mounting a
 * fresh `ShowAnswerButton` — never checked, or reset, on its own.
 * `ShowAnswerButton`'s own mount, unmounting the Retry button that had
 * focus, is what actually calls `useFocusWhenEnabled`; this just tells it
 * to claim focus the same way a post-grade mount already does.
 */
const retried = ref(false);

async function load(): Promise<void> {
  loading.value = true;
  loadError.value = false;
  try {
    // Resume rather than restart: the learner may have locked their phone.
    if (!(await session.restore())) await session.start();
  } catch (err) {
    console.error('review: failed to load the session', err);
    loadError.value = true;
  } finally {
    loading.value = false;
  }
}

async function retry(): Promise<void> {
  retried.value = true;
  await load();
}

/**
 * A current item whose card came back missing once nothing is in flight.
 * `refreshCurrent()` sets `card` to `null` rather than throwing when the
 * card row cannot be read, so without this the page would fall through to
 * its trailing skeleton and sit there with no error and no retry. A retry
 * re-runs `restore()`, which drops any item whose card is no longer visible.
 */
const cardMissing = computed(
  () => !session.busy.value && session.current.value !== null && session.card.value === null,
);

onMounted(async () => {
  // Registered before loading, not after, so a failed load still leaves the
  // shortcuts wired for when Retry succeeds. Nothing fires early: `onKey`
  // ignores every key while the session is busy, which it is for the whole
  // of `restore()`/`start()`.
  window.addEventListener('keydown', onKey);
  await load();
});
onUnmounted(() => window.removeEventListener('keydown', onKey));

/**
 * `grade()`/`undo()` run through `useReviewSession`'s one serialising chain
 * and can reject — most realistically IndexedDB connection loss after the
 * Android app is backgrounded. Both `gradeCore` and `undoCore` write inside
 * a single Dexie transaction *before* touching any reactive state (`log`,
 * `index`, `card`), so a rejection there leaves every ref exactly as it was
 * and the card genuinely stays on screen — nothing more to undo here, only
 * to report. See the task report for the narrower case where a rejection
 * lands *after* that transaction (inside `refreshCurrent`/`persist`).
 */
async function grade(value: Grade) {
  // Set *before* awaiting, not after: `session.grade()` flips `revealed` to
  // `false` deep inside its own async chain (after an IndexedDB read), well
  // before this call resolves. Vue can flush that change — mounting
  // `ShowAnswerButton` with whatever `hasGraded` was at that moment — before
  // this function ever gets to a line after the `await`. Setting it first
  // guarantees it is already `true` by the time any of that happens.
  hasGraded.value = true;
  try {
    await session.grade(value);
  } catch (err) {
    console.error('review: failed to save the grade', err);
    toaster.error("Couldn't save that answer", { description: 'Try again.' });
    return;
  }
  if (!endless) await refresh();
}

async function undo() {
  try {
    await session.undo();
  } catch (err) {
    console.error('review: failed to undo', err);
    toaster.error("Couldn't undo that grade", { description: 'Try again.' });
  }
}

function onKey(event: KeyboardEvent) {
  const target = event.target as HTMLElement | null;
  const tag = target?.tagName;
  if (tag === 'INPUT' || tag === 'TEXTAREA' || target?.isContentEditable) return;
  if (event.metaKey || event.ctrlKey || event.altKey) return;
  // A held key (or a fast repeat tap) must not pile a second action up
  // behind one still in flight through the session's queue.
  if (session.busy.value) return;

  if (event.code === 'Space' || event.key === 'Enter') {
    event.preventDefault();
    session.revealed.value ? void grade(3) : session.reveal();
  } else if (session.revealed.value && ['1', '2', '3', '4'].includes(event.key)) {
    event.preventDefault();
    void grade(Number(event.key) as Grade);
  } else if (practice && session.revealed.value && event.key.toLowerCase() === 'x') {
    event.preventDefault();
    void grade(1);
  } else if (session.revealed.value && event.key.toLowerCase() === 'p') {
    event.preventDefault();
    if (session.card.value) void speak(session.card.value.hanzi);
  } else if (event.key.toLowerCase() === 'u') {
    event.preventDefault();
    void undo();
  }
}

const progress = computed(() => (session.total.value === 0 ? 0 : (session.index.value / session.total.value) * 100));
</script>

<template>
  <div class="review">
    <kt-page-header :eyebrow="endless ? 'Endless practice' : undefined" heading="Review" />
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
      <ReviewCard
        :card="session.card.value"
        :item="session.current.value"
        :revealed="session.revealed.value"
        :settings="settings"
        :can-speak="canSpeak"
        @speak="speak"
      />
      <div class="actions fk-session-actions">
        <ShowAnswerButton
          v-if="!session.revealed.value"
          :autofocus="hasGraded || retried"
          :busy="session.busy.value"
          @reveal="session.reveal()"
        />
        <WritingButtons v-else-if="practice" :busy="session.busy.value" @grade="grade" />
        <GradeButtons v-else :intervals="session.intervals.value" :busy="session.busy.value" @grade="grade" />
      </div>
    </template>

    <kt-skeleton v-else height="320px" />
  </div>
</template>

<style scoped>
.review { display: flex; flex-direction: column; gap: var(--gap-card); }
.progress { display: flex; flex-direction: column; gap: 6px; }
.progress-row { display: flex; align-items: center; justify-content: space-between; }
.session-actions { display: flex; gap: var(--gap-button); }
.mono { font: var(--font-normal-small); font-family: var(--font-family-code); color: var(--text-muted); }
.done-body { display: flex; flex-direction: column; align-items: center; gap: 24px; text-align: center; }
.seal { font-family: var(--fk-font-hanzi-serif); font-size: 56px; color: var(--color-primary-base); }
.done-body h2 { margin: 0; font: var(--font-title-h1); color: var(--text-body); }
.done-body p { margin: 0; color: var(--text-muted); }
</style>
