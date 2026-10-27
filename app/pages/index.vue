<script setup lang="ts">
import type { Deck } from '~core/db/schema';
import type { SessionMode } from '~core/db/session';
import { useDecks } from '~/composables/useDecks';
import { useDueCounts } from '~/composables/useDueCounts';
import { useSeedStatus } from '~/composables/useSeedStatus';

const { counts, refresh } = useDueCounts();
const { failed: seedFailed, retry: retrySeedStatus } = useSeedStatus();
const { listAll: listDecks } = useDecks();

const { lessons, load: loadLessons } = useLessons();

const decks = ref<Deck[]>([]);

/**
 * The lessons worth a place here, at most four: those with cards due first,
 * then those already started, then the rest, each in lesson order.
 */
const TODAY_LESSONS = 4;
const featured = computed(() => {
  const rank = (l: (typeof lessons.value)[number]) => (l.due > 0 ? 0 : l.young + l.mature > 0 ? 1 : 2);
  return [...lessons.value].sort((a, b) => rank(a) - rank(b)).slice(0, TODAY_LESSONS);
});

/** Everything outside the schedule, one tap from Today. */
const PRACTICE = [
  { href: '/translation', icon: 'languages', heading: 'Translation', line: 'Match words and meanings.' },
  { href: '/practice', icon: 'infinity', heading: 'Endless', line: 'Drill your decks, no schedule.' },
  { href: '/speaking', icon: 'mic', heading: 'Speaking', line: 'Answer lesson questions aloud.' },
  { href: '/radicals', icon: 'shapes', heading: 'Radicals', line: 'The parts characters are built from.' },
];

/**
 * Distinguishes "still fetching the deck list" from "fetched, and there
 * genuinely are none" — both start as an empty `decks` array, and only the
 * second should ever show an empty/error state. Without this, every load
 * (not just a first launch) flashes "No decks yet" for the beat between
 * mount and `listAll()` resolving, which on a *returning* launch is actively
 * misleading: it blames a seed step that already ran.
 */
const loadingDecks = ref(true);

/**
 * `refresh()` or `listAll()` can genuinely reject — quota exceeded, Safari
 * private browsing, a blocked `versionchange`. `loadingDecks` is cleared in
 * `finally` specifically so a rejection here can never leave the skeleton
 * showing forever with no error and no way out.
 */
const loadError = ref(false);

async function loadToday(): Promise<void> {
  loadingDecks.value = true;
  loadError.value = false;
  try {
    await refresh();
    decks.value = await listDecks();
    await loadLessons();
  } catch (err) {
    console.error('index: failed to load today’s data', err);
    loadError.value = true;
  } finally {
    loadingDecks.value = false;
  }
}

onMounted(loadToday);

/**
 * One summary per session mode. Seconds per card is what a steady session
 * averages: about eight to recall a word, about twenty to draw one.
 */
const MODES: Array<{ mode: SessionMode; heading: string; href: string; secondsPerCard: number }> = [
  { mode: 'review', heading: 'Review', href: '/review', secondsPerCard: 8 },
  { mode: 'writing', heading: 'Writing', href: '/writing', secondsPerCard: 20 },
];

/**
 * Never below one, as `formatInterval` does: only shown while something is
 * due, and one to three cards would otherwise round to "about 0 min".
 */
const minutes = (total: number, secondsPerCard: number) => Math.max(1, Math.round((total * secondsPerCard) / 60));

/** Where a successful retry puts focus: the first mode with work to do. */
const firstDue = computed(() => MODES.findIndex(({ mode }) => counts.value[mode].total > 0));

/**
 * Both Retry buttons below unmount the instant their state resolves — the
 * v-else-if branch that rendered them stops matching, Vue removes the
 * button that had focus, and focus falls to `<body>` with nothing
 * announced, the same stranding class `useFocusWhenEnabled` exists to close
 * for the review page.
 *
 * The natural target is the page heading, but it cannot take one:
 * `kt-page-header` renders its `<h1>` inside its shadow root with no
 * `tabindex` and no `focus()` override (unlike `kt-button`, which delegates
 * `focus()` to its internal `<button>` — see kt-page-header.ts), and the
 * host itself has no `tabindex` either. Calling `.focus()` on the
 * `kt-page-header` element was verified in a real browser (Chromium, via
 * `npx playwright`) to silently no-op: forcing the day's load to fail and
 * clicking Retry left `document.activeElement` on `<body>`, not the
 * heading. A Start button is the next control the learner needs anyway —
 * the first mode with something due (`firstDue`) — so it takes focus
 * instead.
 *
 * `useFocusWhenEnabled`, not a plain call: each Start button is a
 * `kt-button`, which paints its shadow DOM asynchronously, and disables
 * itself when its mode has nothing due — focusing it in that state would be
 * the same silent no-op via a different door. `awaitingRetryRecovery` is the
 * composable's "disabled" gate: it starts `true` so a normal page load
 * never steals focus, a retry sets it `true` again (idempotent, so a second
 * failure can still trigger the watcher) and only a *successful* retry sets
 * it `false`, which is what the composable is watching for.
 */
const startButtons = ref<(HTMLElement & { updateComplete?: Promise<boolean> })[]>([]);
const awaitingRetryRecovery = ref(true);

useFocusWhenEnabled(
  () => startButtons.value[firstDue.value],
  () => awaitingRetryRecovery.value || firstDue.value === -1,
);

async function retryLoad(): Promise<void> {
  awaitingRetryRecovery.value = true;
  await loadToday();
  if (!loadError.value) awaitingRetryRecovery.value = false;
}

async function retrySeed(): Promise<void> {
  // `retrySeedStatus` serialises overlapping calls, so a fast double click
  // on this button never runs two `seedIfNeeded` at once, and `false`
  // always means the attempt failed.
  awaitingRetryRecovery.value = true;
  const ok = await retrySeedStatus();
  if (!ok) return;
  await loadToday();
  awaitingRetryRecovery.value = false;
}
</script>

<template>
  <div class="today">
    <kt-page-header eyebrow="Dashboard" heading="Today" />

    <div class="modes">
    <kt-card v-for="{ mode, heading, href, secondsPerCard } in MODES" :key="mode">
      <p class="overline" slot="header">{{ heading }}</p>
      <div class="summary">
        <div class="counts">
          <kt-stat label="New" :value="String(counts[mode].fresh)" size="small" />
          <kt-stat label="Learning" :value="String(counts[mode].learning)" size="small" />
          <kt-stat label="Due" :value="String(counts[mode].review)" size="small" />
        </div>
        <p class="eta">
          <template v-if="counts[mode].total > 0">
            {{ counts[mode].total }} card{{ counts[mode].total === 1 ? '' : 's' }} today · about
            {{ minutes(counts[mode].total, secondsPerCard) }} min
          </template>
          <template v-else>Nothing due right now</template>
        </p>
        <!--
          No aria-describedby here: it cannot reach across kt-button's shadow
          boundary onto its internal <button> (Kanto's own kt-tooltip
          documents this same limitation for the same reason, in the other
          direction). Instead, when the button is disabled, `label` replaces
          its accessible name outright with the reason — kt-button forwards
          `label` straight to `aria-label` on that internal <button>, so this
          reaches the one place aria-describedby couldn't.
        -->
        <kt-button
          ref="startButtons"
          variant="primary"
          size="large"
          :icon="mode === 'review' ? 'play' : 'pen-line'"
          full-width
          :disabled="counts[mode].total === 0"
          :label="counts[mode].total === 0 ? `Start ${heading.toLowerCase()} — nothing due right now` : ''"
          @click="navigateTo(href)"
        >
          Start {{ heading.toLowerCase() }}
        </kt-button>
      </div>
    </kt-card>
    </div>

    <kt-skeleton v-if="loadingDecks" height="120px" />

    <kt-empty-state
      v-else-if="loadError"
      icon="triangle-alert"
      heading="Couldn't load today's data"
      description="Something went wrong reading the database. Try again."
    >
      <kt-button slot="actions" variant="secondary" size="medium" icon="refresh-cw" @click="retryLoad">Retry</kt-button>
    </kt-empty-state>

    <kt-empty-state
      v-else-if="decks.length === 0 && seedFailed"
      icon="triangle-alert"
      heading="Setup didn't finish"
      description="The starter deck failed to load. Try again, or reload the page."
    >
      <kt-button slot="actions" variant="secondary" size="medium" icon="refresh-cw" @click="retrySeed">Retry</kt-button>
    </kt-empty-state>

    <kt-empty-state
      v-else-if="decks.length === 0"
      icon="layers"
      heading="No decks yet"
      description="Seeded decks load on first launch. If none appeared, reload the page."
    />

    <section v-else class="section" aria-labelledby="today-lessons">
      <div class="section-head">
        <h2 id="today-lessons" class="overline">Lessons</h2>
        <kt-button v-if="lessons.length > 0" variant="text" size="small" icon="chevron-right" icon-position="right" @click="navigateTo('/lessons')">All lessons</kt-button>
      </div>
      <div v-if="featured.length > 0" class="lesson-grid">
        <LessonCard v-for="l in featured" :key="l.lesson" :lesson="l" compact />
      </div>
      <kt-alert v-else variant="info" description="Tag decks with a lesson name, such as Lesson 5, to learn each lesson in one go.">
        <kt-button slot="actions" variant="secondary" size="small" icon="layers" @click="navigateTo('/decks')">Go to decks</kt-button>
      </kt-alert>
    </section>

    <section class="section" aria-labelledby="today-practice">
      <h2 id="today-practice" class="overline">Practice</h2>
      <div class="practice-grid">
        <kt-card v-for="p in PRACTICE" :key="p.href" clickable :aria-label="p.heading" @kt-card-click="navigateTo(p.href)">
          <div class="tile">
            <kt-icon :name="p.icon" size="20" />
            <span class="tile-heading">{{ p.heading }}</span>
            <span class="tile-line">{{ p.line }}</span>
          </div>
        </kt-card>
      </div>
    </section>
  </div>
</template>

<style scoped>
/* No exact token for 24px here: --gap-sub-menu is scoped to sub-menu
   layout, and the codebase's own precedent (AppSidebar.vue, review.vue's
   .done-body) already treats this outer page gap as a literal rather than
   reaching for it. */
.today { display: flex; flex-direction: column; gap: 24px; }
.overline { margin: 0; font: var(--font-title-overline); letter-spacing: var(--letter-spacing-overline); text-transform: uppercase; color: var(--text-muted); }
.modes { display: grid; grid-template-columns: minmax(0, 1fr); gap: 24px; }
/* Same 900px breakpoint as the shell: the sidebar appears, and there is room for two. */
@media (min-width: 900px) {
  .modes { grid-template-columns: repeat(2, minmax(0, 1fr)); }
}
.summary { display: flex; flex-direction: column; gap: var(--gap-form); }
/* 12px matches --gap-drag-drop by value only — that token names an
   interaction this grid has nothing to do with, so a literal is the
   honest choice (name-plus-value match wins over value alone). */
.counts { display: grid; grid-template-columns: repeat(3, minmax(0, 1fr)); gap: 12px; }
.eta { margin: 0; font: var(--font-normal-small); color: var(--text-muted); }
.section { display: flex; flex-direction: column; gap: var(--gap-button); }
.section-head { display: flex; align-items: center; justify-content: space-between; }
.lesson-grid { display: grid; grid-template-columns: minmax(0, 1fr); gap: var(--gap-card); }
.practice-grid { display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)); gap: var(--gap-button); }
@media (min-width: 900px) {
  .lesson-grid { grid-template-columns: repeat(2, minmax(0, 1fr)); }
  .practice-grid { grid-template-columns: repeat(4, minmax(0, 1fr)); }
}
.tile { display: flex; flex-direction: column; align-items: flex-start; gap: 4px; color: var(--text-body); }
.tile-heading { font: var(--font-title-h6); color: var(--text-body); }
.tile-line { font: var(--font-normal-small); color: var(--text-muted); }
</style>
