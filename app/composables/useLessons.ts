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

export interface LevelRow {
  level: LevelRef;
  units: UnitRow[];
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
  const failure = ref<string | null>(null);
  let generation = 0;

  async function load(): Promise<void> {
    const bundle = settings.value.bundle;
    if (!bundle) return;
    const mine = ++generation;
    failure.value = null;
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
      return {
        level,
        units: level.units.map((unit) => ({
          unit,
          lessons: unit.lessonIds.flatMap((id) => {
            const ref = lessons.get(id);
            return ref ? [{ ref, done: done.value.has(id) }] : [];
          }),
          writingDone: done.value.has(writingId(unit.id)),
        })),
      };
    });
  });

  const next = computed<Step | null>(() => (index.value ? nextStep(index.value, done.value) : null));
  const goal = computed(() => settings.value.dailyLessons);
  const error = computed(() => failure.value);

  return { levels, next, todayCount, goal, error, loaded, retry: load };
}
