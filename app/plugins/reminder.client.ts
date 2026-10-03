import { App } from '@capacitor/app';
import { useDueCounts } from '~/composables/useDueCounts';
import { useReminder } from '~/composables/useReminder';
import { settingsLoaded, useSettings } from '~/composables/useSettings';
import { debounced } from '~/utils/debounce';

// Behaviour, not a styling token: how long the due count must stay still
// before the week of notifications is rebuilt. A review session changes it
// on every answer; rebuilding up to 28 notifications each time is waste.
const COUNT_SETTLE_MS = 5_000;

/**
 * Keeps the daily reminder in step with the app. The one hook is the shared due
 * counts: every grade already refreshes them, and so does every collection
 * write, so watching the total covers "the last card was just done" without
 * touching any page. Count changes are batched; changing the reminder setting
 * reschedules at once.
 */
export default defineNuxtPlugin(() => {
  const reminder = useReminder();
  if (!reminder.native) return;

  const { settings } = useSettings();
  const { counts, refresh } = useDueCounts();

  void (async () => {
    try {
      await settingsLoaded();
      await refresh();
    } catch (err) {
      console.error('reminder: startup load failed', err);
    }
    await reminder.reschedule();
    const afterCounts = debounced(() => void reminder.reschedule(), COUNT_SETTLE_MS);
    // A change of the due count waits for the session to settle...
    watch(() => counts.value.review.total + counts.value.writing.total, () => afterCounts.request());
    // ...a change of the reminder itself applies at once, as the learner expects after Save...
    watch(
      () => [settings.value.reminderEnabled, settings.value.reminderTimes.join(','), settings.value.reminderDays.join(',')],
      () => {
        // A pending count update reschedules with the new settings anyway.
        if (!afterCounts.flush()) void reminder.reschedule();
      },
    );
    // ...and leaving the app never strands a pending update.
    void App.addListener('appStateChange', (state) => {
      if (!state.isActive) afterCounts.flush();
    });
  })();
});
