import { Capacitor } from '@capacitor/core';
import { LocalNotifications } from '@capacitor/local-notifications';
import { useDueCounts } from '~/composables/useDueCounts';
import { useSettings } from '~/composables/useSettings';
import { nextReminder } from '~core/reminder/schedule';

/** Fanka has one reminder, so one fixed notification id. */
export const REMINDER_ID = 1;

/** The few things the composable needs from a notification engine, so tests can fake it. */
export interface ReminderEngine {
  /** Asks for notification permission; true when granted. */
  requestPermission(): Promise<boolean>;
  cancel(id: number): Promise<void>;
  schedule(id: number, at: number, title: string, body: string): Promise<void>;
}

const nativeEngine: ReminderEngine = {
  async requestPermission() {
    const current = await LocalNotifications.checkPermissions();
    if (current.display === 'granted') return true;
    return (await LocalNotifications.requestPermissions()).display === 'granted';
  },
  async cancel(id) {
    await LocalNotifications.cancel({ notifications: [{ id }] });
  },
  async schedule(id, at, title, body) {
    await LocalNotifications.schedule({ notifications: [{ id, title, body, schedule: { at: new Date(at), allowWhileIdle: false } }] });
  },
};

/** Whether this build can show reminders at all; false in the browser. */
export function useNativePlatform(): boolean {
  return Capacitor.isNativePlatform();
}

/**
 * The daily reminder. On the web every call is a no-op. `reschedule()` always
 * cancels Fanka's notification first, then schedules the next one when the
 * reminder is on; it never throws, since a notification problem must not break
 * the screen that triggered it.
 */
export function useReminder(engine?: ReminderEngine) {
  const native = engine !== undefined || Capacitor.isNativePlatform();
  const notifier = engine ?? nativeEngine;
  const { settings } = useSettings();
  const { counts } = useDueCounts();

  async function requestPermission(): Promise<boolean> {
    if (!native) return false;
    try {
      return await notifier.requestPermission();
    } catch (err) {
      console.error('useReminder: could not ask for permission', err);
      return false;
    }
  }

  async function reschedule(now = Date.now()): Promise<void> {
    if (!native) return;
    try {
      await notifier.cancel(REMINDER_ID);
      if (!settings.value.reminderEnabled) return;
      const total = counts.value.review.total + counts.value.writing.total;
      const next = nextReminder(now, settings.value.reminderTime, total, total === 0);
      if (next) await notifier.schedule(REMINDER_ID, next.at, 'Fanka', next.body);
    } catch (err) {
      console.error('useReminder: could not reschedule', err);
    }
  }

  return { native, requestPermission, reschedule };
}
