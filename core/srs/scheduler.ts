import type { SrsState } from './types';

export function newSrsState(now: number): SrsState {
  return {
    state: 'new',
    due: now,
    stability: 0,
    difficulty: 0,
    elapsedDays: 0,
    scheduledDays: 0,
    reps: 0,
    lapses: 0,
    learningSteps: 0,
    lastReview: null,
  };
}
