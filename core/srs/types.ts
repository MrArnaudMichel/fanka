/** Again, Hard, Good, Easy — the four buttons, and ts-fsrs' Rating values. */
export type Grade = 1 | 2 | 3 | 4;

export type ItemState = 'new' | 'learning' | 'review' | 'relearning';

/**
 * Everything the scheduler needs to decide the next interval, and nothing
 * else. Deliberately free of ids and card content so the scheduler stays a
 * pure function of scheduling state.
 *
 * `learningSteps` is round-tripped for ts-fsrs. Dropping it silently breaks
 * short-term scheduling the moment a session is resumed from storage.
 */
export interface SrsState {
  state: ItemState;
  due: number;
  stability: number;
  difficulty: number;
  elapsedDays: number;
  scheduledDays: number;
  reps: number;
  lapses: number;
  learningSteps: number;
  lastReview: number | null;
}

export interface SchedulerSettings {
  desiredRetention: number;
  maxInterval: number;
}

export interface Scheduler {
  /** All four outcomes, so a button can show what pressing it will do. */
  preview(state: SrsState, now: number, settings: SchedulerSettings): Record<Grade, SrsState>;
  apply(state: SrsState, grade: Grade, now: number, settings: SchedulerSettings): SrsState;
}

export const GRADES: Grade[] = [1, 2, 3, 4];
