<script setup lang="ts">
import { writingId } from '~core/curriculum/engine';
import UnitList from '~/components/lesson/UnitList.vue';
import { useLessons, type LevelRow, type SectionRow } from '~/composables/useLessons';

const { levels, next, error, loaded, retry } = useLessons();

const nextId = computed(() => {
  const step = next.value;
  if (!step) return null;
  return step.kind === 'lesson' ? step.lesson.id : writingId(step.unit.id);
});

const holdsNext = (units: SectionRow['units']) =>
  units.some((u) => u.lessons.some((l) => l.ref.id === nextId.value) || writingId(u.unit.id) === nextId.value);

/**
 * What the learner opened or closed, by key. A collapsible is a <details>, so
 * closed content would still be in the DOM; this decides what is rendered, and
 * the one holding the next step starts open.
 */
const toggled = reactive(new Map<string, boolean>());
const isOpen = (key: string, holds: boolean) => toggled.get(key) ?? holds;
const onToggle = (key: string, event: Event) => {
  toggled.set(key, (event as CustomEvent<{ open: boolean }>).detail.open);
};
const levelKey = (row: LevelRow) => `level:${row.level.level}`;
const sectionKey = (row: LevelRow, s: number) => `${levelKey(row)}:${s}`;
</script>

<template>
  <div class="lessons-page">
    <kt-page-header eyebrow="Learn" heading="Lessons" />

    <kt-empty-state
      v-if="error"
      icon="triangle-alert"
      heading="Couldn't load the lessons"
      description="The lesson list could not be read. Check your connection and try again."
    >
      <kt-button slot="actions" variant="secondary" size="medium" icon="refresh-cw" @click="retry">Retry</kt-button>
    </kt-empty-state>

    <kt-skeleton v-else-if="!loaded" count="4" />

    <kt-empty-state
      v-else-if="levels.length === 0"
      icon="book-open"
      heading="No lessons yet"
      description="This course has no lessons."
    />

    <kt-card v-else>
      <kt-collapsible
        v-for="row in levels"
        :key="row.level.level"
        :heading="`${row.level.name} · ${row.level.lessons.length} lessons`"
        :open="isOpen(levelKey(row), holdsNext(row.units))"
        @kt-toggle="onToggle(levelKey(row), $event)"
      >
        <template v-if="isOpen(levelKey(row), holdsNext(row.units))">
          <UnitList v-if="row.sections.length === 1" :row="row" :units="row.sections[0]!.units" :next-id="nextId" />
          <kt-collapsible
            v-for="(section, s) in row.sections.length > 1 ? row.sections : []"
            :key="s"
            :heading="section.heading"
            :open="isOpen(sectionKey(row, s), holdsNext(section.units))"
            @kt-toggle="onToggle(sectionKey(row, s), $event)"
          >
            <UnitList v-if="isOpen(sectionKey(row, s), holdsNext(section.units))" :row="row" :units="section.units" :next-id="nextId" />
          </kt-collapsible>
        </template>
      </kt-collapsible>
    </kt-card>
  </div>
</template>

<style scoped>
.lessons-page { display: flex; flex-direction: column; gap: var(--gap-card); }
</style>
