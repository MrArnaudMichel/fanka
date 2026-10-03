import 'fake-indexeddb/auto';
import { beforeEach, describe, expect, it } from 'vitest';
import { db } from '~core/db/db';
import { DEFAULT_SETTINGS, loadSettings, saveSettings } from '~core/db/settings';

beforeEach(async () => {
  await db.delete();
  await db.open();
});

describe('settings', () => {
  it('returns the defaults when nothing is stored', async () => {
    expect(await loadSettings()).toEqual(DEFAULT_SETTINGS);
  });

  it('persists a patch and leaves the rest alone', async () => {
    const saved = await saveSettings({ newPerDay: 30 });
    expect(saved.newPerDay).toBe(30);
    expect(saved.algorithm).toBe(DEFAULT_SETTINGS.algorithm);
    expect((await loadSettings()).newPerDay).toBe(30);
  });

  it('fills in fields added by a later version', async () => {
    await db.settings.put({ key: 'settings', value: { newPerDay: 7 } });
    const loaded = await loadSettings();
    expect(loaded.newPerDay).toBe(7);
    expect(loaded.desiredRetention).toBe(DEFAULT_SETTINGS.desiredRetention);
  });

  it('defaults to FSRS at 90% retention', () => {
    expect(DEFAULT_SETTINGS.algorithm).toBe('FSRS');
    expect(DEFAULT_SETTINGS.desiredRetention).toBe(0.9);
  });

  it('drops unknown stored keys, such as the retired audio and reminders fields', async () => {
    await db.settings.put({ key: 'settings', value: { newPerDay: 7, audio: true, reminders: { hour: 8 } } });
    const loaded = await loadSettings();
    expect(loaded.newPerDay).toBe(7);
    expect(loaded).not.toHaveProperty('audio');
    expect(loaded).not.toHaveProperty('reminders');
    expect(Object.keys(loaded).sort()).toEqual(Object.keys(DEFAULT_SETTINGS).sort());
  });

  it('defaults to the violet accent and the default text size', () => {
    expect(DEFAULT_SETTINGS.accent).toBe('violet');
    expect(DEFAULT_SETTINGS.textSize).toBe('default');
  });

  it('migrates a stored single reminder time into the list', async () => {
    await db.settings.put({ key: 'settings', value: { reminderEnabled: true, reminderTime: '07:30' } });
    const loaded = await loadSettings();
    expect(loaded.reminderTimes).toEqual(['07:30']);
    expect(loaded.reminderDays).toEqual([0, 1, 2, 3, 4, 5, 6]);
    expect(loaded).not.toHaveProperty('reminderTime');
  });

  it('prefers a stored list over a leftover single time', async () => {
    await db.settings.put({ key: 'settings', value: { reminderTime: '07:30', reminderTimes: ['09:00'] } });
    expect((await loadSettings()).reminderTimes).toEqual(['09:00']);
  });

  it('falls back to the default accent and text size when the stored ones are unknown', async () => {
    await db.settings.put({ key: 'settings', value: { accent: 'neon', textSize: 'huge', newPerDay: 7 } });
    const loaded = await loadSettings();
    expect(loaded.accent).toBe(DEFAULT_SETTINGS.accent);
    expect(loaded.textSize).toBe(DEFAULT_SETTINGS.textSize);
    expect(loaded.newPerDay).toBe(7);
  });

  it('keeps a known accent and text size', async () => {
    await db.settings.put({ key: 'settings', value: { accent: 'teal', textSize: 'large' } });
    const loaded = await loadSettings();
    expect(loaded.accent).toBe('teal');
    expect(loaded.textSize).toBe('large');
  });
});
