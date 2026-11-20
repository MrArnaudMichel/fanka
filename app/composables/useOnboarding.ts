import type { Bundle } from '~core/chinese/script';
import { suggestedBundle } from '~core/db/onboarding';
import { useReminder } from '~/composables/useReminder';
import { useSettings } from '~/composables/useSettings';

export interface OnboardingChoice {
  bundle: Bundle;
  dailyLessons: 1 | 2 | 3;
}

/**
 * The first-launch onboarding at /welcome. The reminder step saves as soon as
 * permission is granted (the reminder plugin reschedules on that change);
 * everything else is saved once, by `finish`, so leaving half-way leaves the
 * learner not onboarded.
 */
export function useOnboarding() {
  const { settings, update } = useSettings();
  const { native, requestPermission } = useReminder();

  /** Turns the reminder on at `time` once notifications are allowed; false when they are blocked. */
  async function enableReminder(time: string): Promise<boolean> {
    if (!(await requestPermission())) return false;
    await update({ reminderEnabled: true, reminderTimes: [time] });
    return true;
  }

  async function finish(choice: OnboardingChoice): Promise<void> {
    await update({ bundle: choice.bundle, dailyLessons: choice.dailyLessons, onboardedAt: Date.now() });
  }

  return { settings, remindersAvailable: native, suggestedBundle, enableReminder, finish };
}
