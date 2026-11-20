/** @typedef {import('../../../core/curriculum/types').LessonRef} LessonRef */
/** @typedef {import('../../../core/curriculum/types').UnitRef} UnitRef */

const LESSON_SIZE = 10;
const MIN_LAST_LESSON = 5;
const UNIT_SIZE = 3;

const pad = (/** @type {number} */ n, /** @type {number} */ width) => String(n).padStart(width, '0');

/**
 * Cuts a level's words (already in level order) into lessons of 10, merging a
 * last lesson of fewer than 5 into the previous one, and lessons into units
 * of 3 (a short last unit stands alone).
 * @param {Array<{ id: string }>} levelWords
 * @param {number} level
 * @param {'hsk' | 'tbcl'} prefix
 * @returns {{ lessons: LessonRef[], units: UnitRef[] }}
 */
export function cutLessons(levelWords, level, prefix) {
  const chunks = [];
  for (let i = 0; i < levelWords.length; i += LESSON_SIZE) chunks.push(levelWords.slice(i, i + LESSON_SIZE));
  if (chunks.length > 1 && /** @type {any[]} */ (chunks[chunks.length - 1]).length < MIN_LAST_LESSON) {
    const last = /** @type {any[]} */ (chunks.pop());
    /** @type {any[]} */ (chunks[chunks.length - 1]).push(...last);
  }
  const unitId = (/** @type {number} */ i) => `${prefix}${level}-u${pad(i + 1, 2)}`;
  /** @type {LessonRef[]} */
  const lessons = chunks.map((words, i) => ({
    id: `${prefix}${level}-l${pad(i + 1, 3)}`,
    unit: unitId(Math.floor(i / UNIT_SIZE)),
    wordIds: words.map((w) => w.id),
  }));
  /** @type {UnitRef[]} */
  const units = [];
  for (let i = 0; i < lessons.length; i += UNIT_SIZE) {
    units.push({ id: unitId(i / UNIT_SIZE), lessonIds: lessons.slice(i, i + UNIT_SIZE).map((l) => l.id) });
  }
  return { lessons, units };
}
