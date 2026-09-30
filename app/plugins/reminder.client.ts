import { useDueCounts } from '~/composables/useDueCounts';
import { useReminder } from '~/composables/useReminder';
import { settingsLoaded, useSettings } from '~/composables/useSettings';

/**
 * Keeps the daily reminder in step with the app. The one hook is the shared due
 * counts: every grade already refreshes them, and so does every collection
 * write, so watching the total covers "the last card was just done" without
 * touching any page. Changing the reminder setting reschedules too.
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
    watch(
      () => [counts.value.review.total + counts.value.writing.total, settings.value.reminderEnabled, settings.value.reminderTime],
      () => void reminder.reschedule(),
    );
  })();
});
