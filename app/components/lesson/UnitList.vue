<script setup lang="ts">
import { writingId } from '~core/curriculum/engine';
import type { LevelRow, UnitRow } from '~/composables/useLessons';

/** The units of a level (or of one section of it), each with its lessons and its writing session. */
defineProps<{ row: LevelRow; units: UnitRow[]; nextId: string | null }>();

const words = (n: number) => `${n} word${n === 1 ? '' : 's'}`;
</script>

<template>
  <div v-for="unit in units" :key="unit.unit.id" class="unit">
    <p class="overline">Unit {{ row.unitNumbers.get(unit.unit.id) }}</p>
    <div v-for="lesson in unit.lessons" :key="lesson.ref.id" class="row">
      <kt-button
        :variant="lesson.ref.id === nextId ? 'primary' : 'secondary'"
        size="small"
        @click="navigateTo(`/lessons/${lesson.ref.id}`)"
      >
        Lesson {{ row.numbers.get(lesson.ref.id) }}
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
</template>

<style scoped>
.unit { display: flex; flex-direction: column; gap: var(--gap-button); padding-block: var(--gap-form); }
.row { display: flex; align-items: center; gap: var(--gap-button); }
.overline { margin: 0; font: var(--font-title-overline); letter-spacing: var(--letter-spacing-overline); text-transform: uppercase; color: var(--text-muted); }
.meta { font: var(--font-normal-small); color: var(--text-muted); }
</style>
