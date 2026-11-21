import type { ContentIndex, LessonRef, LevelRef, UnitRef } from './types';

export type Step =
  | { kind: 'lesson'; lesson: LessonRef; level: LevelRef }
  | { kind: 'writing'; unit: UnitRef; level: LevelRef };

export function writingId(unitId: string): string {
  return `${unitId}-writing`;
}

/**
 * The first lesson not done, in level and unit order; once a unit's lessons
 * are all done, its writing session comes before the next unit's lessons.
 */
export function nextStep(index: ContentIndex, done: ReadonlySet<string>): Step | null {
  for (const level of index.levels) {
    const lessons = new Map(level.lessons.map((lesson) => [lesson.id, lesson]));
    for (const unit of level.units) {
      for (const lessonId of unit.lessonIds) {
        const lesson = lessons.get(lessonId);
        if (lesson && !done.has(lesson.id)) return { kind: 'lesson', lesson, level };
      }
      if (!done.has(writingId(unit.id))) return { kind: 'writing', unit, level };
    }
  }
  return null;
}

export function scoreLesson(results: { wordId: string; right: boolean }[]): {
  right: number;
  total: number;
  missed: string[];
} {
  const missed: string[] = [];
  let right = 0;
  for (const result of results) {
    if (result.right) right += 1;
    else if (!missed.includes(result.wordId)) missed.push(result.wordId);
  }
  return { right, total: results.length, missed };
}

/** Every lesson id and writing session id of levels `1..through`: what "I already know this far" marks done. */
export function idsKnownThrough(index: ContentIndex, through: number): string[] {
  const ids: string[] = [];
  for (const level of index.levels) {
    if (level.level > through) continue;
    for (const lesson of level.lessons) ids.push(lesson.id);
    for (const unit of level.units) ids.push(writingId(unit.id));
  }
  return ids;
}
