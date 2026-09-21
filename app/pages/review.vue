<script setup lang="ts">
import { useDueCounts } from '~/composables/useDueCounts';
import { useReviewSession } from '~/composables/useReviewSession';
import { useSettings } from '~/composables/useSettings';
import type { Grade } from '~core/srs/types';

const session = useReviewSession();
const { settings } = useSettings();
const { refresh } = useDueCounts();

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

async function grade(value: Grade) {
  // Set *before* awaiting, not after: `session.grade()` flips `revealed` to
  // `false` deep inside its own async chain (after an IndexedDB read), well
  // before this call resolves. Vue can flush that change — mounting
  // `ShowAnswerButton` with whatever `hasGraded` was at that moment — before
  // this function ever gets to a line after the `await`. Setting it first
  // guarantees it is already `true` by the time any of that happens.
  hasGraded.value = true;
  await session.grade(value);
  await refresh();
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
  } else if (event.key.toLowerCase() === 'u') {
    event.preventDefault();
    void session.undo();
  }
}

const progress = computed(() => (session.total.value === 0 ? 0 : (session.index.value / session.total.value) * 100));
</script>

<template>
  <div class="review">
    <header class="bar">
      <div class="progress">
        <div class="counts">
          <span>Session</span>
          <span class="mono">{{ session.position.value }} / {{ session.total.value }}</span>
        </div>
        <kt-progress-bar :value="progress" label="Session progress" />
      </div>
      <kt-button
        variant="secondary-no-bg"
        size="small"
        icon="undo-2"
        label="Undo"
        :disabled="session.busy.value || session.log.value.length === 0"
        @click="session.undo()"
      />
      <kt-button variant="secondary-no-bg" size="small" icon="x" label="Leave session" @click="navigateTo('/')" />
    </header>

    <kt-skeleton v-if="loading" height="320px" />

    <kt-empty-state
      v-else-if="loadError || cardMissing"
      icon="triangle-alert"
      heading="Couldn't load this session"
      description="Something went wrong reading the database. Try again."
    >
      <kt-button slot="actions" variant="secondary" size="medium" icon="refresh-cw" @click="load">Retry</kt-button>
    </kt-empty-state>

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
      />
      <ShowAnswerButton
        v-if="!session.revealed.value"
        :autofocus="hasGraded"
        :busy="session.busy.value"
        @reveal="session.reveal()"
      />
      <GradeButtons v-else :intervals="session.intervals.value" :busy="session.busy.value" @grade="grade" />
    </template>

    <kt-skeleton v-else height="320px" />
  </div>
</template>

<style scoped>
.review { display: flex; flex-direction: column; gap: var(--gap-card); }
.bar { display: flex; align-items: center; gap: var(--gap-form); flex-wrap: wrap; }
.progress { flex: 1; min-width: 220px; display: flex; flex-direction: column; gap: 6px; }
.counts { display: flex; justify-content: space-between; font: var(--font-normal-small); color: var(--text-muted); }
.mono { font-family: var(--font-family-code); }
.done-body { display: flex; flex-direction: column; align-items: center; gap: 24px; text-align: center; }
.seal { font-family: var(--fk-font-hanzi-serif); font-size: 56px; color: var(--color-primary-base); }
.done-body h2 { margin: 0; font: var(--font-title-h1); color: var(--text-body); }
.done-body p { margin: 0; color: var(--text-muted); }
</style>
