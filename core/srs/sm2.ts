import type { Grade, ItemState, Scheduler, SchedulerSettings, SrsState } from './types';

/**
 * SM-2, offered because the settings screen presents it as a real choice and a
 * learner migrating from Anki recognises its intervals.
 *
 * The ease factor lives in SrsState.difficulty. Reusing the field rather than
 * adding an algorithm-specific one keeps a single persisted shape, so switching
 * algorithms never needs a migration.
 */

const DAY = 86_400_000;
const MIN_EASE = 1.3;
const RELEARN_MINUTES = 10;

/** SM-2's q scale is 0-5; Fanka's four buttons map onto its upper half. */
const QUALITY: Record<Grade, number> = { 1: 2, 2: 3, 3: 4, 4: 5 };

function nextEase(ease: number, grade: Grade): number {
  const q = QUALITY[grade];
  const adjusted = ease + (0.1 - (5 - q) * (0.08 + (5 - q) * 0.02));
  return Math.max(MIN_EASE, Number(adjusted.toFixed(4)));
}

function step(state: SrsState, grade: Grade, now: number, settings: SchedulerSettings): SrsState {
  const ease = nextEase(state.difficulty ?? 2.5, grade);
  const common = {
    ...state,
    difficulty: ease,
    reps: state.reps + 1,
    elapsedDays: state.lastReview === null ? 0 : Math.round((now - state.lastReview) / DAY),
    lastReview: now,
  };

  if (grade === 1) {
    return {
      ...common,
      state: 'relearning',
      lapses: state.lapses + 1,
      scheduledDays: 0,
      stability: 0,
      due: now + RELEARN_MINUTES * 60_000,
    };
  }

  // A lapse zeroes scheduledDays and moves the card to 'relearning' without
  // touching reps, which stays a truthful lifetime counter (as on the FSRS
  // side) rather than a ladder position. So the ladder rung is derived from
  // the card's own state/scheduledDays instead of reps: a card that is new,
  // mid-relearning, or was just zeroed by a lapse restarts at the 1-day step
  // rather than multiplying the zero the lapse just wrote.
  const restarting = state.state === 'new' || state.state === 'relearning' || state.scheduledDays === 0;

  let days: number;
  let nextState: ItemState;
  if (restarting) {
    days = 1;
    nextState = 'learning';
  } else if (state.scheduledDays === 1) {
    days = 6;
    nextState = 'review';
  } else {
    days = Math.round(state.scheduledDays * ease);
    nextState = 'review';
  }

  days = Math.min(days, settings.maxInterval);

  return {
    ...common,
    state: nextState,
    scheduledDays: days,
    stability: days,
    due: now + days * DAY,
  };
}

export function createSm2Scheduler(): Scheduler {
  function preview(state: SrsState, now: number, settings: SchedulerSettings): Record<Grade, SrsState> {
    return {
      1: step(state, 1, now, settings),
      2: step(state, 2, now, settings),
      3: step(state, 3, now, settings),
      4: step(state, 4, now, settings),
    };
  }

  return { preview, apply: (state, grade, now, settings) => preview(state, now, settings)[grade] };
}
