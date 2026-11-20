<script setup lang="ts">
import { writingId } from '~core/curriculum/engine';
import { sectionsOf, useLessons, type LevelRow, type UnitRow } from '~/composables/useLessons';

const { levels, next, error, loaded, retry } = useLessons();

/** A lesson's number in its level, so "Lesson 3" means the same here and on Today. */
function numbers(row: LevelRow): Map<string, number> {
  return new Map(row.level.lessons.map((lesson, i) => [lesson.id, i + 1]));
}

const nextId = computed(() => {
  const step = next.value;
  if (!step) return null;
  return step.kind === 'lesson' ? step.lesson.id : writingId(step.unit.id);
});

const holdsNext = (units: UnitRow[]) =>
  units.some((u) => u.lessons.some((l) => l.ref.id === nextId.value) || writingId(u.unit.id) === nextId.value);

const sections = (row: LevelRow) => sectionsOf(row.units);
const sectionHeading = (units: UnitRow[], row: LevelRow, numbering: Map<string, number>) => {
  const first = numbering.get(units[0]?.lessons[0]?.ref.id ?? '');
  const last = [...units].reverse().flatMap((u) => u.lessons).at(-1);
  return `Lessons ${first ?? 1}–${last ? numbering.get(last.ref.id) : row.level.lessons.length}`;
};
const unitLabel = (row: LevelRow, unit: UnitRow) => `Unit ${row.units.indexOf(unit) + 1}`;
const words = (n: number) => `${n} word${n === 1 ? '' : 's'}`;
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

    <kt-skeleton v-else-if="!loaded" height="120px" />

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
        :open="holdsNext(row.units)"
      >
        <template v-for="(units, s) in sections(row)" :key="s">
          <component
            :is="sections(row).length > 1 ? 'kt-collapsible' : 'div'"
            v-bind="sections(row).length > 1 ? { heading: sectionHeading(units, row, numbers(row)), open: holdsNext(units) } : {}"
            class="section"
          >
            <div v-for="unit in units" :key="unit.unit.id" class="unit">
              <p class="overline">{{ unitLabel(row, unit) }}</p>
              <div v-for="lesson in unit.lessons" :key="lesson.ref.id" class="row">
                <kt-button
                  :variant="lesson.ref.id === nextId ? 'primary' : 'secondary'"
                  size="small"
                  @click="navigateTo(`/lessons/${lesson.ref.id}`)"
                >
                  Lesson {{ numbers(row).get(lesson.ref.id) }}
                </kt-button>
                <span class="meta">{{ words(lesson.ref.wordIds.length) }}</span>
                <kt-badge v-if="lesson.done" tone="success" size="small" label="Done" />
              </div>
              <div class="row">
                <kt-button
                  :variant="writingId(unit.unit.id) === nextId ? 'primary' : 'secondary'"
                  size="small"
                  icon="pen-line"
                  @click="navigateTo(`/lessons/${writingId(unit.unit.id)}`)"
                >
                  Writing
                </kt-button>
                <kt-badge v-if="unit.writingDone" tone="success" size="small" label="Done" />
              </div>
            </div>
          </component>
        </template>
      </kt-collapsible>
    </kt-card>
  </div>
</template>

<style scoped>
.lessons-page { display: flex; flex-direction: column; gap: 24px; }
.unit { display: flex; flex-direction: column; gap: var(--gap-button); padding-block: var(--gap-form); }
.row { display: flex; align-items: center; gap: var(--gap-button); }
.overline { margin: 0; font: var(--font-title-overline); letter-spacing: var(--letter-spacing-overline); text-transform: uppercase; color: var(--text-muted); }
.meta { font: var(--font-normal-small); color: var(--text-muted); }
</style>
