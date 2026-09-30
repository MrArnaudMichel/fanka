import 'fake-indexeddb/auto';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { REMINDER_ID, type ReminderEngine, useReminder } from '~/composables/useReminder';
import { useDueCounts } from '~/composables/useDueCounts';
import { useSettings } from '~/composables/useSettings';
import { db } from '~core/db/db';

function fakeEngine(granted = true) {
  const calls: string[] = [];
  const engine: ReminderEngine = {
    requestPermission: vi.fn(async () => granted),
    cancel: vi.fn(async (id: number) => {
      calls.push(`cancel:${id}`);
    }),
    schedule: vi.fn(async (id: number, at: number, _title: string, body: string) => {
      calls.push(`schedule:${id}:${at}:${body}`);
    }),
  };
  return { engine, calls };
}

const NOW = new Date(2026, 8, 16, 8, 0).getTime();

// Every useReminder() call starts a fire-and-forget due-count refresh; let it
// finish before the next beforeEach deletes the database under it.
afterEach(async () => {
  await useDueCounts().refresh();
  await vi.waitFor(() => new Promise((resolve) => setTimeout(resolve, 10)));
});

beforeEach(async () => {
  await db.delete();
  await db.open();
});

describe('useReminder', () => {
  it('only cancels when the reminder is off', async () => {
    const { engine, calls } = fakeEngine();
    await useSettings().update({ reminderEnabled: false });
    await useReminder(engine).reschedule(NOW);
    expect(calls).toEqual([`cancel:${REMINDER_ID}`]);
  });

  it('cancels then schedules at the chosen time when on', async () => {
    const { engine, calls } = fakeEngine();
    await useSettings().update({ reminderEnabled: true, reminderTime: '19:30' });
    await useReminder(engine).reschedule(NOW);
    // Due counts are not loaded in this test, so today reads as done: tomorrow, generic body.
    expect(calls).toEqual([
      `cancel:${REMINDER_ID}`,
      `schedule:${REMINDER_ID}:${new Date(2026, 8, 17, 19, 30).getTime()}:Time for today's cards`,
    ]);
  });

  it('reports the permission result', async () => {
    expect(await useReminder(fakeEngine(false).engine).requestPermission()).toBe(false);
    expect(await useReminder(fakeEngine(true).engine).requestPermission()).toBe(true);
  });

  it('never throws when the engine fails', async () => {
    const { engine } = fakeEngine();
    engine.cancel = vi.fn(async () => {
      throw new Error('boom');
    });
    vi.spyOn(console, 'error').mockImplementation(() => {});
    await expect(useReminder(engine).reschedule(NOW)).resolves.toBeUndefined();
  });
});
