import type { SessionMode } from '~core/db/session';
import { useLessonSession } from '~/composables/useLessonSession';
import { usePracticeSession } from '~/composables/usePracticeSession';
import { useReviewSession } from '~/composables/useReviewSession';
import { focusCardIds } from '~/utils/focus';

/**
 * - `scheduled`: what is due today (the default).
 * - `endless`: `?endless=1`, practice outside the schedule, `?cards=` to focus.
 * - `lesson`: `?lesson=Lesson 5`, every card of one lesson until each is right.
 */
export type RunKind = 'scheduled' | 'endless' | 'lesson';

/**
 * Which session Review or Writing runs, read from the query once: the pages
 * key on the full path, so a change of query remounts them.
 */
export function useStudyRun(mode: SessionMode) {
  const query = useRoute().query;
  const lesson = typeof query.lesson === 'string' && query.lesson.trim() ? query.lesson.trim() : null;
  const endless = !lesson && query.endless === '1';
  const focus = endless ? focusCardIds(query.cards) : undefined;

  const lessonSession = lesson ? useLessonSession(mode, lesson) : null;
  const endlessSession = endless ? usePracticeSession(mode, { cardIds: focus }) : null;
  /** Either unscheduled session: no undo, no intervals, a verdict rather than four grades. */
  const practice = lessonSession ?? endlessSession;
  const session = practice ?? useReviewSession(mode);
  const kind: RunKind = lesson ? 'lesson' : endless ? 'endless' : 'scheduled';

  return {
    kind,
    lesson,
    lessonSession,
    practice,
    session,
    focus,
    /** Where leaving the session goes back to. */
    leaveHref: lesson ? '/lessons' : endless ? '/practice' : '/',
    eyebrow: lesson ?? (endless ? 'Endless practice' : undefined),
  };
}
