import type { Bundle } from '~core/chinese/script';
import { idsKnownThrough } from '~core/curriculum/engine';
import type { LevelRef } from '~core/curriculum/types';
import { suggestedBundle } from '~core/db/onboarding';
import { lessonProgress } from '~core/db/repositories';
import { useContent } from '~/composables/useContent';
import { useReminder } from '~/composables/useReminder';
import { useSettings } from '~/composables/useSettings';

export interface OnboardingChoice {
  bundle: Bundle;
  dailyLessons: 1 | 2 | 3;
  /** The highest level the learner already knows (levels 1..n are marked known), or null for a beginner. */
  knownThrough: number | null;
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

  /** The bundle's levels, or none when its content index cannot be loaded: the level step then offers only "I'm new". */
  async function levelsOf(bundle: Bundle): Promise<LevelRef[]> {
    const content = useContent();
    await content.loadIndex(bundle);
    return content.index.value?.levels ?? [];
  }

  async function finish(choice: OnboardingChoice): Promise<void> {
    if (choice.knownThrough !== null) {
      const content = useContent();
      await content.loadIndex(choice.bundle);
      if (!content.index.value) throw new Error('The lesson index could not be loaded.');
      await lessonProgress.markKnown(choice.bundle, idsKnownThrough(content.index.value, choice.knownThrough), Date.now());
    }
    await update({ bundle: choice.bundle, dailyLessons: choice.dailyLessons, onboardedAt: Date.now() });
  }

  return { settings, remindersAvailable: native, suggestedBundle, levelsOf, enableReminder, finish };
}
