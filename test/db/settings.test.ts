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
});
