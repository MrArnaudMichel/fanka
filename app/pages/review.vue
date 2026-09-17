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

onMounted(async () => {
  // Resume rather than restart: the learner may have locked their phone.
  if (!(await session.restore())) await session.start();
  loading.value = false;
  window.addEventListener('keydown', onKey);
});
onUnmounted(() => window.removeEventListener('keydown', onKey));

async function grade(value: Grade) {
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
      <kt-button v-if="!session.revealed.value" variant="primary" size="large" full-width @click="session.reveal()">
        Show answer
      </kt-button>
      <GradeButtons v-else :intervals="session.intervals.value" :busy="session.busy.value" @grade="grade" />
    </template>

    <kt-skeleton v-else height="320px" />
  </div>
</template>

<style scoped>
.review { display: flex; flex-direction: column; gap: 20px; }
.bar { display: flex; align-items: center; gap: 16px; flex-wrap: wrap; }
.progress { flex: 1; min-width: 220px; display: flex; flex-direction: column; gap: 6px; }
.counts { display: flex; justify-content: space-between; font: var(--font-normal-small); color: var(--text-muted); }
.mono { font-family: var(--font-family-code); }
.done-body { display: flex; flex-direction: column; align-items: center; gap: 24px; text-align: center; }
.seal { font-family: var(--fk-font-hanzi-serif); font-size: 56px; color: var(--color-primary-base); }
.done-body h2 { margin: 0; font: var(--font-title-h1); color: var(--text-body); }
.done-body p { margin: 0; color: var(--text-muted); }
</style>
