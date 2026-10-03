import 'fake-indexeddb/auto';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { FIRST_REMINDER_ID, type ReminderEngine, type ScheduledNotification, TEST_REMINDER_ID, useReminder } from '~/composables/useReminder';
import { useDueCounts } from '~/composables/useDueCounts';
import { useSettings } from '~/composables/useSettings';
import { db } from '~core/db/db';

function fakeEngine(granted = true, pendingIds: number[] = []) {
  const calls: string[] = [];
  const engine: ReminderEngine = {
    requestPermission: vi.fn(async () => granted),
    pending: vi.fn(async () => pendingIds),
    cancel: vi.fn(async (ids: number[]) => {
      calls.push(`cancel:${ids.join(',')}`);
    }),
    schedule: vi.fn(async (list: ScheduledNotification[]) => {
      calls.push(...list.map((n) => `schedule:${n.id}:${n.at}:${n.body}`));
    }),
  };
  return { engine, calls };
}

const NOW = new Date(2026, 8, 16, 8, 0).getTime();

afterEach(async () => {
  await useDueCounts().refresh();
  await vi.waitFor(() => new Promise((resolve) => setTimeout(resolve, 10)));
});

beforeEach(async () => {
  await db.delete();
  await db.open();
});

describe('useReminder', () => {
  it('cancels every pending reminder, the legacy id included, and the test one untouched', async () => {
    const { engine, calls } = fakeEngine(true, [1, 99, 100, 101, 127, 200]);
    await useSettings().update({ reminderEnabled: false });
    await useReminder(engine).reschedule(NOW);
    expect(calls).toEqual(['cancel:1,100,101,127']);
  });

  it('schedules a week of reminders from id 100 when on', async () => {
    const { engine, calls } = fakeEngine();
    await useSettings().update({ reminderEnabled: true, reminderTimes: ['19:30'], reminderDays: [0, 1, 2, 3, 4, 5, 6] });
    await useReminder(engine).reschedule(NOW);
    // Due counts are not loaded here, so today reads as done: first is tomorrow.
    const scheduled = calls.filter((c) => c.startsWith('schedule:'));
    expect(scheduled).toHaveLength(6);
    expect(scheduled[0]).toBe(`schedule:${FIRST_REMINDER_ID}:${new Date(2026, 8, 17, 19, 30).getTime()}:Time for today's cards`);
    expect(scheduled[5]!.startsWith(`schedule:${FIRST_REMINDER_ID + 5}:`)).toBe(true);
  });

  it('sends a test notification a second from now', async () => {
    const { engine, calls } = fakeEngine();
    expect(await useReminder(engine).sendTest(NOW)).toBe(true);
    expect(calls).toEqual([`schedule:${TEST_REMINDER_ID}:${NOW + 1000}:Reminders are working`]);
  });

  it('does not send a test without permission', async () => {
    const { engine, calls } = fakeEngine(false);
    expect(await useReminder(engine).sendTest(NOW)).toBe(false);
    expect(calls).toEqual([]);
  });

  it('reports the permission result', async () => {
    expect(await useReminder(fakeEngine(false).engine).requestPermission()).toBe(false);
    expect(await useReminder(fakeEngine(true).engine).requestPermission()).toBe(true);
  });

  it('never throws when the engine fails', async () => {
    const { engine } = fakeEngine();
    engine.pending = vi.fn(async () => {
      throw new Error('boom');
    });
    vi.spyOn(console, 'error').mockImplementation(() => {});
    await expect(useReminder(engine).reschedule(NOW)).resolves.toBeUndefined();
  });

  it('runs overlapping reschedules one after another, leaving only the last batch', async () => {
    await useSettings().update({ reminderEnabled: true, reminderTimes: ['19:30'], reminderDays: [0, 1, 2, 3, 4, 5, 6] });
    const live = new Set<number>();
    const calls: string[] = [];
    let release!: () => void;
    const gate = new Promise<void>((resolve) => (release = resolve));
    let first = true;
    const engine: ReminderEngine = {
      requestPermission: async () => true,
      pending: vi.fn(async () => {
        if (first) {
          first = false;
          await gate;
        }
        return [...live];
      }),
      cancel: async (ids) => {
        calls.push('cancel');
        ids.forEach((id) => live.delete(id));
      },
      schedule: async (list) => {
        calls.push('schedule');
        list.forEach((n) => live.add(n.id));
      },
    };
    const { reschedule } = useReminder(engine);
    const a = reschedule(NOW);
    const b = reschedule(NOW);
    release();
    await Promise.all([a, b]);
    expect(calls).toEqual(['cancel', 'schedule', 'cancel', 'schedule']);
    expect([...live]).toHaveLength(6);
  });
});
