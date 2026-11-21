import { computed, ref, watch } from 'vue';
import type { LessonRef, LevelRef, UnitRef } from '~core/curriculum/types';
import { type Step, nextStep, writingId } from '~core/curriculum/engine';
import { lessonProgress } from '~core/db/repositories';
import { startOfDayLocal } from '~core/stats/time';
import { useContent } from '~/composables/useContent';
import { useSettings } from '~/composables/useSettings';

export interface LessonRow {
  ref: LessonRef;
  done: boolean;
}

export interface UnitRow {
  unit: UnitRef;
  lessons: LessonRow[];
  writingDone: boolean;
}

/** A run of units shown together; a long level is cut into several. */
export interface SectionRow {
  heading: string;
  units: UnitRow[];
}

export interface LevelRow {
  level: LevelRef;
  units: UnitRow[];
  /** A lesson's number in its level, so "Lesson 3" means the same everywhere. */
  numbers: Map<string, number>;
  /** A unit's number in its level. */
  unitNumbers: Map<string, number>;
  sections: SectionRow[];
}

/** Most lessons shown in one section of a long level (HSK 7–9). */
export const SECTION_LESSONS = 50;

/** Splits a level's units into sections of at most `SECTION_LESSONS` lessons; a short level is one section. */
export function sectionsOf(units: UnitRow[]): UnitRow[][] {
  const sections: UnitRow[][] = [];
  let count = 0;
  for (const unit of units) {
    const size = unit.lessons.length;
    if (sections.length === 0 || count + size > SECTION_LESSONS) {
      sections.push([]);
      count = 0;
    }
    sections[sections.length - 1]!.push(unit);
    count += size;
  }
  return sections;
}

/**
 * The active bundle's lessons with their done marks, the next step, and how
 * many lessons were finished today. Reloads when the bundle changes.
 */
export function useLessons() {
  const { settings } = useSettings();
  const content = useContent();
  const done = ref<Set<string>>(new Set());
  const todayCount = ref(0);
  const loaded = ref(false);
  /** The bundle `done` and `todayCount` belong to. */
  let loadedFor: string | null = null;
  const failure = ref<string | null>(null);
  let generation = 0;

  async function load(): Promise<void> {
    const bundle = settings.value.bundle;
    if (!bundle) return;
    const mine = ++generation;
    failure.value = null;
    // Another bundle's done marks must not show on this one's lessons.
    if (loadedFor !== bundle) {
      done.value = new Set();
      todayCount.value = 0;
      loaded.value = false;
      loadedFor = null;
    }
    await content.loadIndex(bundle);
    if (mine !== generation) return;
    if (content.error.value) {
      failure.value = content.error.value;
      return;
    }
    try {
      const [finished, today] = await Promise.all([
        lessonProgress.done(bundle),
        lessonProgress.countSince(bundle, startOfDayLocal(Date.now())),
      ]);
      if (mine !== generation) return;
      done.value = finished;
      todayCount.value = today;
      loaded.value = true;
      loadedFor = bundle;
    } catch (err) {
      if (mine !== generation) return;
      failure.value = err instanceof Error ? err.message : String(err);
    }
  }

  watch(() => settings.value.bundle, load, { immediate: true });

  const index = computed(() => {
    const bundle = settings.value.bundle;
    return content.index.value && content.index.value.bundle === bundle ? content.index.value : null;
  });

  const levels = computed<LevelRow[]>(() => {
    if (!index.value) return [];
    return index.value.levels.map((level) => {
      const lessons = new Map(level.lessons.map((lesson) => [lesson.id, lesson]));
      const numbers = new Map(level.lessons.map((lesson, i) => [lesson.id, i + 1]));
      const units = level.units.map((unit) => ({
        unit,
        lessons: unit.lessonIds.flatMap((id) => {
          const ref = lessons.get(id);
          return ref ? [{ ref, done: done.value.has(id) }] : [];
        }),
        writingDone: done.value.has(writingId(unit.id)),
      }));
      const sections = sectionsOf(units).map((group) => {
        const lessonsIn = group.flatMap((u) => u.lessons);
        const first = numbers.get(lessonsIn[0]?.ref.id ?? '') ?? 1;
        const last = numbers.get(lessonsIn.at(-1)?.ref.id ?? '') ?? level.lessons.length;
        return { heading: `Lessons ${first}–${last}`, units: group };
      });
      return { level, units, numbers, unitNumbers: new Map(level.units.map((u, i) => [u.id, i + 1])), sections };
    });
  });

  const next = computed<Step | null>(() => (index.value ? nextStep(index.value, done.value) : null));
  /** "Lesson 3 · HSK 1" or "Writing · unit 2", as Today and the lesson list name a step. */
  const nextLabel = computed(() => {
    const step = next.value;
    if (!step) return null;
    return step.kind === 'lesson'
      ? `Lesson ${step.level.lessons.findIndex((l) => l.id === step.lesson.id) + 1} · ${step.level.name}`
      : `Writing · unit ${step.level.units.findIndex((u) => u.id === step.unit.id) + 1}`;
  });
  const goal = computed(() => settings.value.dailyLessons);
  const error = computed(() => failure.value);

  return { levels, next, nextLabel, todayCount, goal, error, loaded, retry: load };
}
