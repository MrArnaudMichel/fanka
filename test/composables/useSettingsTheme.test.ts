import 'fake-indexeddb/auto';
import { beforeEach, describe, expect, it } from 'vitest';
import { db } from '~core/db/db';
import { loadSettings } from '~core/db/settings';

// `useSettings` keeps its state at module scope (see useSettings.test.ts's own
// note), so this scenario gets its own file rather than sharing one with
// another test that also calls `useSettings()` — a second call in the same
// file would find the module's `loading` guard already settled from this
// one and skip re-reading Dexie, passing (or failing) vacuously.
beforeEach(async () => {
  await db.delete();
  await db.open();
  delete document.documentElement.dataset.theme;
  delete document.documentElement.dataset.hanziFont;
});

describe('useSettings — theme preference round-trip', () => {
  it('applies a saved theme and hanzi font to <html>, and persists them back through Dexie', async () => {
    const { useSettings } = await import('~/composables/useSettings');
    const { settings, update } = useSettings();

    await update({ theme: 'light', hanziFont: 'sans' });

    // Applied to the document immediately, not just held in memory.
    expect(document.documentElement.dataset.theme).toBe('light');
    expect(document.documentElement.dataset.hanziFont).toBe('sans');
    expect(settings.value.theme).toBe('light');
    expect(settings.value.hanziFont).toBe('sans');

    // Round-trips through Dexie independently of the in-memory ref — a
    // fresh read sees exactly what was saved, not just what the ref holds.
    const reloaded = await loadSettings();
    expect(reloaded.theme).toBe('light');
    expect(reloaded.hanziFont).toBe('sans');
  });
});
