import { type Card, type FSRS, State, createEmptyCard, fsrs, generatorParameters } from 'ts-fsrs';

import type { Grade, ItemState, Scheduler, SchedulerSettings, SrsState } from './types';

/**
 * FSRS-6 via ts-fsrs, behind Fanka's own SrsState so that nothing outside this
 * file knows the library's snake_case shape or its Date-typed fields.
 *
 * Fuzz is disabled on purpose. It randomises the interval on each call, which
 * would make the preview on a grade button differ from what pressing it does.
 * A button that lies about its own consequence is worse than a marginally
 * less-spread review load.
 */

const STATE_TO_FSRS: Record<ItemState, State> = {
  new: State.New,
  learning: State.Learning,
  review: State.Review,
  relearning: State.Relearning,
};

const STATE_FROM_FSRS: Record<State, ItemState> = {
  [State.New]: 'new',
  [State.Learning]: 'learning',
  [State.Review]: 'review',
  [State.Relearning]: 'relearning',
};

function toCard(state: SrsState): Card {
  const empty = createEmptyCard(new Date(state.due));
  return {
    ...empty,
    due: new Date(state.due),
    stability: state.stability,
    difficulty: state.difficulty,
    elapsed_days: state.elapsedDays,
    scheduled_days: state.scheduledDays,
    reps: state.reps,
    lapses: state.lapses,
    learning_steps: state.learningSteps,
    state: STATE_TO_FSRS[state.state],
    last_review: state.lastReview === null ? undefined : new Date(state.lastReview),
  };
}

function fromCard(card: Card): SrsState {
  return {
    state: STATE_FROM_FSRS[card.state],
    due: card.due.getTime(),
    stability: card.stability,
    difficulty: card.difficulty,
    elapsedDays: card.elapsed_days,
    scheduledDays: card.scheduled_days,
    reps: card.reps,
    lapses: card.lapses,
    learningSteps: card.learning_steps,
    lastReview: card.last_review ? card.last_review.getTime() : null,
  };
}

/**
 * ts-fsrs instances are cheap but not free, and the settings change rarely, so
 * one instance is kept per distinct settings pair.
 */
function instanceFor(settings: SchedulerSettings, cache: Map<string, FSRS>): FSRS {
  const key = `${settings.desiredRetention}:${settings.maxInterval}`;
  const hit = cache.get(key);
  if (hit) return hit;
  const made = fsrs(
    generatorParameters({
      request_retention: settings.desiredRetention,
      maximum_interval: settings.maxInterval,
      enable_fuzz: false,
    }),
  );
  cache.set(key, made);
  return made;
}

/**
 * ts-fsrs clamps each grade's interval to `maximum_interval` individually,
 * but then bumps Good and Easy past Hard (and Hard past Again) to keep the
 * four outcomes strictly ordered. That bump runs after the clamp, so at high
 * stability — where several grades are already pinned at the ceiling — Good
 * or Easy can land a day or two beyond the cap. `maxInterval` is a promise
 * Fanka makes to the caller, so it is re-enforced here rather than trusted
 * to the library's internal ordering pass.
 *
 * Only `due` and `scheduledDays` are capped; `stability` is deliberately
 * left as ts-fsrs computed it. FSRS stability is a function of the grade,
 * difficulty and retrievability, never of the interval actually assigned,
 * and ts-fsrs already decouples the two itself for Hard. Shrinking it to
 * match the cap would understate memory strength and skew every later
 * interval.
 *
 * Scoped to `repeat()` output only — the ordering-pass overshoot described
 * above is what it was verified against. A future `reschedule()` (e.g.
 * after a settings change) must re-verify the library's behaviour there
 * before reusing this.
 */
function capToMaxInterval(state: SrsState, now: number, settings: SchedulerSettings): SrsState {
  const maxDue = now + settings.maxInterval * 86_400_000;
  if (state.due <= maxDue) return state;
  return { ...state, due: maxDue, scheduledDays: settings.maxInterval };
}

export function createFsrsScheduler(): Scheduler {
  const cache = new Map<string, FSRS>();

  function preview(state: SrsState, now: number, settings: SchedulerSettings): Record<Grade, SrsState> {
    const outcomes = instanceFor(settings, cache).repeat(toCard(state), new Date(now));
    const cap = (s: SrsState) => capToMaxInterval(s, now, settings);
    return {
      1: cap(fromCard(outcomes[1].card)),
      2: cap(fromCard(outcomes[2].card)),
      3: cap(fromCard(outcomes[3].card)),
      4: cap(fromCard(outcomes[4].card)),
    };
  }

  return {
    preview,
    // apply reads the same object preview does, so the two cannot drift.
    apply: (state, grade, now, settings) => preview(state, now, settings)[grade],
  };
}
