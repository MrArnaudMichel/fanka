import { createFsrsScheduler } from './fsrs';
import { createSm2Scheduler } from './sm2';
import type { Scheduler } from './types';

export type Algorithm = 'FSRS' | 'SM-2';

const schedulers: Record<Algorithm, Scheduler> = {
  FSRS: createFsrsScheduler(),
  'SM-2': createSm2Scheduler(),
};

export function schedulerFor(algorithm: Algorithm): Scheduler {
  return schedulers[algorithm];
}

export * from './scheduler';
export * from './types';
