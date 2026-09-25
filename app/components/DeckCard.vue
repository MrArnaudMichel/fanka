<script setup lang="ts">
import type { KtMeterSegment, KtOption } from 'kanto-ds';
import { computed } from 'vue';
import type { DeckSummary } from '~core/db/repositories';
import type { Deck } from '~core/db/schema';

/**
 * One deck. Compact (the default) is a swatch, the name and its tag — the
 * Today list from Task 3. Full is the /decks screen's version of the same
 * card: it adds the study-composition meter, the due/new counts and an
 * actions dropdown. One component, two modes, so the two screens can never
 * quietly drift apart the way a second copy would let them.
 *
 * `summary` is required in full mode — the counts and the meter both read it
 * — and ignored in compact mode, which only ever needed `deck`.
 */
const props = withDefaults(defineProps<{ deck: Deck; mode?: 'compact' | 'full'; summary?: DeckSummary }>(), {
  mode: 'compact',
});

const emit = defineEmits<{ edit: [deck: Deck]; delete: [deck: Deck] }>();

const dropdownOptions: KtOption[] = [
  { id: 'browse', label: 'Browse cards' },
  { id: 'edit', label: 'Edit' },
  { id: 'delete', label: 'Delete' },
];

/**
 * "Browse cards" navigates directly rather than emitting — unlike Edit and
 * Delete, it does not open anything on this page, so there is nothing for a
 * parent to own. It now opens the deck detail page (ruling 2,
 * task-13-report.md), which opens on its Cards tab by default — the same
 * scoped table Browse itself uses, just reached through the deck rather than
 * a `?deck=<id>` filter. `/browse?deck=<id>` stays supported; it is simply no
 * longer linked from here.
 */
function onSelect(event: CustomEvent<{ value: string | number | null }>): void {
  if (event.detail.value === 'browse') navigateTo(`/decks/${props.deck.id}`);
  else if (event.detail.value === 'edit') emit('edit', props.deck);
  else if (event.detail.value === 'delete') emit('delete', props.deck);
}

/**
 * No `color` on any segment: `kt-meter` assigns `--chart-series-N` by
 * position on its own, which is what keeps this from becoming a second place
 * a colour gets hard-coded.
 */
const meterSegments = computed<KtMeterSegment[]>(() => {
  if (!props.summary) return [];
  return [
    { label: 'Mature', value: props.summary.mature },
    { label: 'Young', value: props.summary.young },
    { label: 'New', value: props.summary.fresh },
  ];
});
</script>

<template>
  <kt-card>
    <div class="row" :class="{ full: mode === 'full' }" :slot="mode === 'full' ? 'header' : undefined">
      <span class="swatch" :style="{ background: deck.colorToken }" />
      <span class="name">{{ deck.name }}</span>
      <kt-badge v-if="deck.tag" variant="category" tone="neutral" size="small" :label="deck.tag" />

      <!--
        align="end": the trigger sits at the row's right edge (`.menu`'s
        `margin-left: auto` below), so the panel — 224px wide, per
        kt-dropdown.ts — needs to hang off that edge leftward rather than
        anchor from the trigger's left and extend rightward past it. Without
        this, the closed panel (position: absolute, visibility: hidden, but
        still sized and placed) pushed the page's own scrollWidth wider than
        its viewport at narrow widths, even though nothing was ever opened —
        see task-10-report.md, "Fix round 1".
      -->
      <kt-dropdown v-if="mode === 'full'" class="menu" align="end" :options="dropdownOptions" @kt-select="onSelect">
        <kt-button slot="trigger" variant="secondary-no-bg" size="small" icon="ellipsis" label="Deck actions" />
      </kt-dropdown>
    </div>

    <template v-if="mode === 'full' && summary">
      <kt-meter :segments="meterSegments" show-legend />
      <p class="counts">{{ summary.due }} due · {{ summary.fresh }} new</p>
    </template>
  </kt-card>
</template>

<style scoped>
.row { display: flex; align-items: center; gap: 10px; }
/* 10px matches no token by value (closest are --gap-button at 8px and
   --gap-drag-drop at 12px, and neither name describes this row), so it
   stays a literal — same precedent as index.vue's .counts gap. */
.swatch { width: 4px; height: 26px; border-radius: var(--radius-full); flex: none; }
.row.full .swatch { height: 20px; }
.name { flex: 1; min-width: 0; font: var(--font-normal-medium); color: var(--text-body); overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.menu { flex: none; margin-left: auto; }
.counts { margin: 0; font: var(--font-normal-small); color: var(--text-muted); }
</style>
