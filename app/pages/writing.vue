<script setup lang="ts">
import { toaster } from 'kanto-ui';
import { useDueCounts } from '~/composables/useDueCounts';
import { useReviewSession } from '~/composables/useReviewSession';
import { useSettings } from '~/composables/useSettings';
import type { Grade } from '~core/srs/types';

/**
 * Writing practice is a second front end onto the same session engine and
 * the same persisted session record `review.vue` uses — see
 * `useReviewSession`'s doc comment: it is a plain function, not a singleton,
 * and two instances only ever agree through what they persist to and
 * restore from Dexie. There is one "today's session" in this app, not one
 * per screen; starting a session here and continuing it from Review (or
 * vice versa) is deliberate, not a bug — see the task report.
 */
const session = useReviewSession();
const { settings } = useSettings();
const { refresh } = useDueCounts();

const loading = ref(true);
const hasGraded = ref(false);
const loadError = ref(false);
const retried = ref(false);

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

onMounted(async () => {
  window.addEventListener('keydown', onKey);
  await load();
});
onUnmounted(() => window.removeEventListener('keydown', onKey));

async function grade(value: Grade) {
  hasGraded.value = true;
  try {
    await session.grade(value);
  } catch (err) {
    console.error('writing: failed to save the grade', err);
    toaster.error("Couldn't save that answer", { description: 'Try again.' });
    return;
  }
  await refresh();
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

  if (event.code === 'Space' || event.key === 'Enter') {
    event.preventDefault();
    session.revealed.value ? void grade(3) : session.reveal();
  } else if (session.revealed.value && event.key.toLowerCase() === 'x') {
    event.preventDefault();
    void grade(1);
  } else if (event.key.toLowerCase() === 'u') {
    event.preventDefault();
    void undo();
  }
}

const progress = computed(() => (session.total.value === 0 ? 0 : (session.index.value / session.total.value) * 100));
</script>

<template>
  <div class="writing">
    <kt-page-header eyebrow="Session" heading="Writing practice">
      <kt-button
        slot="actions"
        variant="secondary-no-bg"
        size="small"
        icon="undo-2"
        label="Undo"
        :disabled="session.busy.value || session.log.value.length === 0"
        @click="undo"
      />
      <kt-button
        slot="actions"
        variant="secondary-no-bg"
        size="small"
        icon="x"
        label="Leave session"
        @click="navigateTo('/')"
      />
    </kt-page-header>

    <div class="progress">
      <span class="mono">{{ session.position.value }} / {{ session.total.value }}</span>
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
      <WritingCard :card="session.card.value" :revealed="session.revealed.value" :settings="settings" />
      <ShowAnswerButton
        v-if="!session.revealed.value"
        :autofocus="hasGraded || retried"
        :busy="session.busy.value"
        @reveal="session.reveal()"
      />
      <WritingButtons v-else :busy="session.busy.value" @grade="grade" />
      <p v-if="session.revealed.value" class="hints">
        <kt-kbd>Space</kt-kbd> right <kt-kbd>X</kt-kbd> wrong <kt-kbd>U</kt-kbd> undo
      </p>
    </template>

    <kt-skeleton v-else height="320px" />
  </div>
</template>

<style scoped>
.writing { display: flex; flex-direction: column; gap: var(--gap-card); }
.progress { display: flex; flex-direction: column; gap: 6px; }
.mono { font: var(--font-normal-small); font-family: var(--font-family-code); color: var(--text-muted); }
.done-body { display: flex; flex-direction: column; align-items: center; gap: 24px; text-align: center; }
.seal { font-family: var(--fk-font-hanzi-serif); font-size: 56px; color: var(--color-primary-base); }
.done-body h2 { margin: 0; font: var(--font-title-h1); color: var(--text-body); }
.done-body p { margin: 0; color: var(--text-muted); }
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
