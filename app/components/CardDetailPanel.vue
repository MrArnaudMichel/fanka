<script setup lang="ts">
import type { KtTimelineVariant } from 'kanto-ds';
import PinyinText from '~/components/PinyinText.vue';
import { type BrowseRow, STATE_META } from '~/composables/useBrowse';
import type { Review } from '~core/db/schema';
import type { Grade } from '~core/srs';

/**
 * One card's details, in a side panel: fields, a review timeline, and the
 * Edit/Suspend or Unsuspend/Delete actions. `row` is the live table row for
 * the open card — after a suspend/unsuspend, `CardTable` reloads and this
 * prop updates with it, so the panel reflects the new state without closing
 * (ruling 5); only a delete closes it, and that is `CardTable`'s call, not
 * this component's.
 */
const props = defineProps<{ open: boolean; row: BrowseRow | null; historyRows: Review[]; historyLoading: boolean; historyError: boolean }>();
const emit = defineEmits<{ close: []; suspend: [cardId: string]; unsuspend: [cardId: string]; delete: [cardId: string] }>();

const stateMeta = computed(() => (props.row ? STATE_META[props.row.state] : null));

/**
 * Same mapping as `GradeButtons.vue`'s buttons (ruling 7): Again is danger,
 * Hard is warning, Good is success, Easy is info. Kept local rather than
 * shared — `GradeButtons.vue` already carries its own copy for the review
 * screen, and a shared constant across two unrelated features is a
 * refactor this task was not asked to make (see deferred minors).
 */
const GRADE_META: Record<Grade, { label: string; variant: KtTimelineVariant }> = {
  1: { label: 'Again', variant: 'danger' },
  2: { label: 'Hard', variant: 'warning' },
  3: { label: 'Good', variant: 'success' },
  4: { label: 'Easy', variant: 'info' },
};

/** Newest first — kt-timeline.md's own example reads top-to-bottom as most-recent-first; `historyForCard` itself returns oldest first (Step 1's contract), so it is reversed only for display. */
const timeline = computed(() => [...props.historyRows].reverse());

const MINUTE = 60_000;
const HOUR = 3_600_000;
const DAY = 86_400_000;
const RELATIVE_UNITS: [Intl.RelativeTimeFormatUnit, number][] = [
  ['year', 365 * DAY],
  ['month', 30 * DAY],
  ['week', 7 * DAY],
  ['day', DAY],
  ['hour', HOUR],
  ['minute', MINUTE],
];
const relativeFormat = new Intl.RelativeTimeFormat('en', { numeric: 'auto' });

/** No existing formatter covers "time ago" (`formatInterval` reads as a countdown, e.g. "3 d" — wrong tense for a past review), so this is `Intl.RelativeTimeFormat` directly, per ruling 7. */
function relativeTime(at: number): string {
  const diffMs = at - Date.now();
  const absMs = Math.abs(diffMs);
  for (const [unit, unitMs] of RELATIVE_UNITS) {
    if (absMs >= unitMs) return relativeFormat.format(Math.round(diffMs / unitMs), unit);
  }
  return relativeFormat.format(Math.round(diffMs / MINUTE), 'minute');
}

function onClose(): void {
  emit('close');
}
</script>

<template>
  <kt-side-panel :open="open" eyebrow="Card" :heading="row?.card.hanzi ?? ''" @kt-close="onClose">
    <template v-if="row">
      <div class="fields fk-selectable">
        <p class="hanzi">{{ row.card.hanzi }}</p>
        <PinyinText :syllables="row.card.pinyin" />
        <p class="translation">{{ row.card.translation }}</p>
        <p v-if="row.card.example" class="example">{{ row.card.example }}</p>
        <div class="meta">
          <kt-badge variant="tag" tone="neutral" size="small">{{ row.deckName }}</kt-badge>
          <kt-badge v-if="stateMeta" variant="tag" :tone="stateMeta.tone" size="small">{{ stateMeta.label }}</kt-badge>
        </div>
      </div>

      <div class="history">
        <p class="section-label">Review history</p>
        <kt-skeleton v-if="historyLoading" height="120px" />
        <p v-else-if="historyError" class="empty">Couldn't load the review history.</p>
        <p v-else-if="timeline.length === 0" class="empty">No reviews yet.</p>
        <kt-timeline v-else compact>
          <kt-timeline-item
            v-for="review in timeline"
            :key="review.id"
            :heading="GRADE_META[review.grade].label"
            :time="relativeTime(review.reviewedAt)"
            :variant="GRADE_META[review.grade].variant"
          />
        </kt-timeline>
      </div>

      <kt-button slot="footer" variant="secondary" icon="square-pen" @click="navigateTo(`/cards/${row.card.id}`)">Edit</kt-button>
      <kt-button
        v-if="row.state !== 'suspended'"
        slot="footer"
        variant="secondary"
        icon="pause"
        @click="emit('suspend', row.card.id)"
      >
        Suspend
      </kt-button>
      <kt-button v-else slot="footer" variant="secondary" icon="play" @click="emit('unsuspend', row.card.id)">Unsuspend</kt-button>
      <kt-button slot="footer" variant="delete" icon="trash-2" @click="emit('delete', row.card.id)">Delete</kt-button>
    </template>
  </kt-side-panel>
</template>

<style scoped>
.fields { display: flex; flex-direction: column; gap: var(--gap-button); }
/* No Kanto font token covers a large hanzi display — ReviewCard.vue's own .example-hanzi (26px) and .answer-hanzi (clamp(...)) are the same kind of literal, for the same reason. */
.hanzi { margin: 0; font-family: var(--fk-font-hanzi); font-size: 32px; color: var(--text-body); }
.translation { margin: 0; font: var(--font-normal-medium); color: var(--text-body); }
.example { margin: 0; font: var(--font-normal-small); color: var(--text-muted); }
.meta { display: flex; gap: var(--gap-button); flex-wrap: wrap; }

.history { display: flex; flex-direction: column; gap: var(--gap-button); margin-top: var(--gap-drag-drop); }
.section-label { margin: 0; font: var(--font-title-overline); letter-spacing: var(--letter-spacing-overline); text-transform: uppercase; color: var(--text-muted); }
.empty { margin: 0; font: var(--font-normal-small); color: var(--text-muted); }
</style>
