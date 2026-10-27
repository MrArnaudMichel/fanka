<script setup lang="ts">
import type { KtMeterSegment } from 'kanto-ds';
import type { DeepReadonly } from 'vue';
import type { LessonSummary } from '~core/lessons';
import { speakingLessonFor } from '~core/speaking';

/**
 * One lesson and every way to study it: learn it whole, write it, drill its
 * meanings, and its speaking questions when there are some. `compact` is the
 * Today page's version: the counts and the one main action.
 */
const props = withDefaults(defineProps<{ lesson: DeepReadonly<LessonSummary>; compact?: boolean }>(), { compact: false });

const q = computed(() => `lesson=${encodeURIComponent(props.lesson.lesson)}`);
const speaking = computed(() => speakingLessonFor(props.lesson.lesson));
/** Share of the lesson's items (both directions) answered at least once. */
const started = computed(() => {
  const all = props.lesson.fresh + props.lesson.young + props.lesson.mature;
  return all === 0 ? 0 : Math.round(((props.lesson.young + props.lesson.mature) / all) * 100);
});

/** Same segments, order and colours as a deck's meter on the Decks page. */
const segments = computed<KtMeterSegment[]>(() => [
  { label: 'Mature', value: props.lesson.mature },
  { label: 'Young', value: props.lesson.young },
  { label: 'New', value: props.lesson.fresh, color: 'var(--border-field)' },
]);
</script>

<template>
  <kt-card>
    <div slot="header" class="head">
      <span class="name">{{ lesson.lesson }}</span>
      <span class="meta">{{ lesson.cards }} card{{ lesson.cards === 1 ? '' : 's' }} · {{ lesson.decks }} deck{{ lesson.decks === 1 ? '' : 's' }}</span>
    </div>

    <div class="body">
      <kt-meter
        label="Progress"
        :used="`${started}% started`"
        :total="lesson.due > 0 ? `${lesson.due} due` : ''"
        :segments="segments"
        :showLegend="!compact"
      />

      <div class="actions">
        <kt-button variant="primary" icon="graduation-cap" @click="navigateTo(`/review?${q}`)">Learn lesson</kt-button>
        <template v-if="!compact">
          <kt-button variant="secondary" icon="languages" @click="navigateTo(`/translation?${q}`)">Translation</kt-button>
          <kt-button variant="secondary" icon="pen-line" @click="navigateTo(`/writing?${q}`)">Write</kt-button>
          <kt-button v-if="speaking" variant="secondary" icon="mic" @click="navigateTo(`/speaking?lesson=${speaking.id}`)">Speaking</kt-button>
        </template>
      </div>
    </div>
  </kt-card>
</template>

<style scoped>
.head { display: flex; align-items: baseline; justify-content: space-between; gap: var(--gap-button); flex-wrap: wrap; }
.name { font: var(--font-title-h5); color: var(--text-body); }
.meta { font: var(--font-normal-small); color: var(--text-muted); }
.body { display: flex; flex-direction: column; gap: var(--gap-form); }
.actions { display: flex; flex-wrap: wrap; gap: var(--gap-button); }
</style>
