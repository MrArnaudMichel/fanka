<script setup lang="ts">
import { type FilteredSnapshot, type StatsWindow, activitySummary, insights, knownTimeline, milestoneProgress, weakWords, weekSummary, writingSummary } from '~core/stats';
import { formatDuration, shortDate } from '~/utils/format';

/**
 * Where the learner stands: this week against the last, words known and the
 * next milestone, a few plain sentences, and the words to work on.
 * `everyMode` is the same deck filter with no mode: a word is known through
 * its recognition item whatever mode the page is filtered on.
 */
const props = defineProps<{ data: FilteredSnapshot; everyMode: FilteredSnapshot; window: StatsWindow; now: number }>();
const emit = defineEmits<{ practise: [cardIds: string[]] }>();

const week = computed(() => weekSummary(props.data.attempts, props.now));
const streak = computed(() => activitySummary(props.data.attempts, props.window, props.now).currentStreak);
const known = computed(() => knownTimeline(props.everyMode.items, props.everyMode.reviews, props.everyMode.cardsById, props.window, props.now));
const milestone = computed(() => milestoneProgress(known.value.known));
const weak = computed(() => weakWords(props.data.attempts, props.data.cardsById, props.window, props.now));
const notes = computed(() => {
  const missed = writingSummary(props.data.attempts, props.window, props.now).missed[0];
  return insights({
    reviews: props.everyMode.reviews,
    attempts: props.data.attempts,
    items: props.everyMode.items,
    missedCharacter: missed ? { character: missed.character, attempts: missed.attempts } : null,
    window: props.window,
    now: props.now,
  });
});

const empty = computed(() => props.data.attempts.length === 0 && props.everyMode.reviews.length === 0);

/** "+12%" against last week, or nothing when last week had none to compare with. */
function change(current: number, previous: number): { delta: string; trend: 'up' | 'down' | 'flat' } | null {
  if (previous === 0) return null;
  const pct = Math.round(((current - previous) / previous) * 100);
  return { delta: `${pct > 0 ? '+' : ''}${pct}%`, trend: pct > 0 ? 'up' : pct < 0 ? 'down' : 'flat' };
}

const tiles = computed(() => {
  const { thisWeek, lastWeek } = week.value;
  return [
    { label: 'Answers', value: String(thisWeek.answers), icon: 'check', change: change(thisWeek.answers, lastWeek.answers) },
    { label: 'Time studied', value: formatDuration(thisWeek.ms), icon: 'clock', change: change(thisWeek.ms, lastWeek.ms) },
    { label: 'Days studied', value: `${thisWeek.days} / 7`, icon: 'calendar', change: change(thisWeek.days, lastWeek.days) },
    { label: 'Current streak', value: `${streak.value} day${streak.value === 1 ? '' : 's'}`, icon: 'flame', change: null },
  ];
});

const nextLabel = computed(() => {
  const { next } = milestone.value;
  return next === null ? 'Every milestone reached' : `${known.value.known} / ${next} known words`;
});
</script>

<template>
  <kt-empty-state v-if="empty" icon="chart-line" heading="Nothing to show yet" description="Study a few cards to see your progress here.">
    <kt-button slot="actions" variant="primary" size="medium" icon="play" @click="navigateTo('/review')">Start reviewing</kt-button>
  </kt-empty-state>

  <div v-else class="tab">
    <section class="block">
      <h2 class="block-heading">This week</h2>
      <div class="tiles">
        <kt-stat
          v-for="t in tiles"
          :key="t.label"
          :label="t.label"
          :value="t.value"
          :icon="t.icon"
          :delta="t.change?.delta ?? ''"
          :trend="t.change?.trend ?? 'flat'"
          :caption="t.change ? 'vs last week' : ''"
        />
      </div>
    </section>

    <div class="pair">
      <kt-card>
        <div slot="header" class="card-heading">Words known</div>
        <div class="known">
          <span class="known-count">{{ known.known }}</span>
          <span class="muted">words · {{ known.characters }} characters</span>
        </div>
        <kt-chart
          v-if="known.series.length >= 2 && known.series.some((p) => p.known > 0)"
          type="line"
          label="Words known"
          height="160"
          :labels="known.series.map((p) => shortDate(p.key))"
          :series="[{ name: 'Known', values: known.series.map((p) => p.known) }]"
        />
      </kt-card>

      <kt-card>
        <div slot="header" class="card-heading">Milestones</div>
        <div class="milestone">
          <kt-icon name="trophy" />
          <span>{{ milestone.reached === null ? 'First milestone: 10 known words' : `${milestone.reached} known words reached` }}</span>
        </div>
        <kt-progress-bar
          v-if="milestone.next !== null"
          :label="nextLabel"
          show-label
          :value="known.known"
          :max="milestone.next"
        />
        <p v-else class="muted">{{ nextLabel }}</p>
        <p class="muted">A word is known once you recall it after three weeks or more.</p>
      </kt-card>
    </div>

    <kt-card v-if="notes.length > 0">
      <div slot="header" class="card-heading">Insights</div>
      <div class="notes">
        <div v-for="n in notes" :key="n.text" class="note">
          <kt-icon :name="n.icon" />
          <span>{{ n.text }}</span>
        </div>
      </div>
    </kt-card>

    <kt-card>
      <div slot="header" class="card-heading">Work on these</div>
      <p v-if="weak.length === 0" class="muted">No misses in this period.</p>
      <template v-else>
        <div class="weak">
          <div v-for="w in weak" :key="w.cardId" class="weak-row">
            <span class="weak-hanzi">{{ w.hanzi }}</span>
            <span class="weak-translation">{{ w.translation }}</span>
            <kt-badge variant="count" tone="danger" size="small">{{ w.wrong }} / {{ w.total }}</kt-badge>
          </div>
        </div>
        <kt-button slot="footer" variant="primary" size="medium" icon="play" @click="emit('practise', weak.map((w) => w.cardId))">Practise these</kt-button>
      </template>
    </kt-card>
  </div>
</template>

<style scoped>
.tab { display: flex; flex-direction: column; gap: var(--gap-card); }
.block { display: flex; flex-direction: column; gap: var(--gap-element); }
.block-heading, .card-heading { font: var(--font-title-h6); color: var(--text-body); margin: 0; }
.tiles { display: grid; grid-template-columns: repeat(auto-fit, minmax(150px, 1fr)); gap: var(--gap-button); }
.pair { display: grid; grid-template-columns: repeat(auto-fit, minmax(280px, 1fr)); gap: var(--gap-card); }
.known { display: flex; align-items: baseline; gap: var(--gap-element); margin-bottom: var(--gap-element); }
.known-count { font: var(--font-title-h1); color: var(--text-body); }
.muted { font: var(--font-normal-small); color: var(--text-muted); margin: 0; }
.milestone { display: flex; align-items: center; gap: var(--gap-element); margin-bottom: var(--gap-element); font: var(--font-normal-medium); color: var(--text-body); }
.milestone kt-icon { color: var(--color-warning-base); }
.notes { display: flex; flex-direction: column; gap: var(--gap-element); }
.note { display: flex; align-items: center; gap: var(--gap-element); font: var(--font-normal-regular); color: var(--text-body); }
.note kt-icon { color: var(--color-primary-text); flex: none; }
.weak { display: flex; flex-direction: column; gap: var(--gap-button); }
.weak-row { display: grid; grid-template-columns: auto 1fr auto; align-items: center; gap: var(--gap-element); }
.weak-hanzi { font: var(--font-title-h6); font-family: var(--fk-font-hanzi); color: var(--text-body); }
.weak-translation { flex: 1; min-width: 0; font: var(--font-normal-regular); color: var(--text-muted); overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
</style>
