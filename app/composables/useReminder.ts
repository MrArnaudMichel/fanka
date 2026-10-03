import { Capacitor } from '@capacitor/core';
import { LocalNotifications } from '@capacitor/local-notifications';
import { useDueCounts } from '~/composables/useDueCounts';
import { useSettings } from '~/composables/useSettings';
import { nextReminders } from '~core/reminder/schedule';

/** Scheduled reminders take ids from here up; at most 4 times × 7 days. */
export const FIRST_REMINDER_ID = 100;
const LAST_REMINDER_ID = 199;
/** The single reminder of earlier builds, cancelled so it cannot linger after an update. */
const LEGACY_REMINDER_ID = 1;
export const TEST_REMINDER_ID = 99;

export interface ScheduledNotification {
  id: number;
  at: number;
  title: string;
  body: string;
}

/** The few things the composable needs from a notification engine, so tests can fake it. */
export interface ReminderEngine {
  /** Asks for notification permission; true when granted. */
  requestPermission(): Promise<boolean>;
  /** Ids of every notification still waiting to show. */
  pending(): Promise<number[]>;
  cancel(ids: number[]): Promise<void>;
  schedule(list: ScheduledNotification[]): Promise<void>;
}

const nativeEngine: ReminderEngine = {
  async requestPermission() {
    const current = await LocalNotifications.checkPermissions();
    if (current.display === 'granted') return true;
    return (await LocalNotifications.requestPermissions()).display === 'granted';
  },
  async pending() {
    return (await LocalNotifications.getPending()).notifications.map((n) => n.id);
  },
  async cancel(ids) {
    if (ids.length > 0) await LocalNotifications.cancel({ notifications: ids.map((id) => ({ id })) });
  },
  async schedule(list) {
    if (list.length === 0) return;
    await LocalNotifications.schedule({
      notifications: list.map((n) => ({ id: n.id, title: n.title, body: n.body, schedule: { at: new Date(n.at), allowWhileIdle: false } })),
    });
  },
};

/** Whether this build can show reminders at all; false in the browser. */
export function useNativePlatform(): boolean {
  return Capacitor.isNativePlatform();
}

function isReminderId(id: number): boolean {
  return id === LEGACY_REMINDER_ID || (id >= FIRST_REMINDER_ID && id <= LAST_REMINDER_ID);
}

/**
 * The reminders. On the web every call is a no-op. `reschedule()` cancels
 * every pending reminder first — so a time or day just removed leaves
 * nothing behind — then schedules the next week when the reminder is on. It
 * never throws, since a notification problem must not break the screen that
 * triggered it.
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
      const stale = (await notifier.pending()).filter(isReminderId);
      await notifier.cancel(stale);
      if (!settings.value.reminderEnabled) return;
      const total = counts.value.review.total + counts.value.writing.total;
      const list = nextReminders(now, settings.value.reminderTimes, settings.value.reminderDays, total, total === 0);
      await notifier.schedule(list.map((r, i) => ({ id: FIRST_REMINDER_ID + i, at: r.at, title: 'Fanka', body: r.body })));
    } catch (err) {
      console.error('useReminder: could not reschedule', err);
    }
  }

  /** A notification a second from now, to check permission and display on this device. */
  async function sendTest(now = Date.now()): Promise<boolean> {
    if (!(await requestPermission())) return false;
    try {
      await notifier.schedule([{ id: TEST_REMINDER_ID, at: now + 1000, title: 'Fanka', body: 'Reminders are working' }]);
      return true;
    } catch (err) {
      console.error('useReminder: could not send the test notification', err);
      return false;
    }
  }

  return { native, requestPermission, reschedule, sendTest };
}
