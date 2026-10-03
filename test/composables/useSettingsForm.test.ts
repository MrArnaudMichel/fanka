import 'fake-indexeddb/auto';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { useSettingsForm } from '~/composables/useSettingsForm';
import { useSettings } from '~/composables/useSettings';
import { db } from '~core/db/db';
import { loadSettings } from '~core/db/settings';

beforeEach(async () => {
  await db.delete();
  await db.open();
});

describe('useSettingsForm', () => {
  it('seeds the draft from the stored settings once they load', async () => {
    await useSettings().update({ newPerDay: 22 });
    const form = useSettingsForm(['newPerDay', 'algorithm']);
    await vi.waitFor(() => expect(form.ready.value).toBe(true));
    expect(form.draft.newPerDay).toBe(22);
  });

  it('saves only its own keys, copying arrays out of the reactive draft', async () => {
    const form = useSettingsForm(['newPerDay']);
    await vi.waitFor(() => expect(form.ready.value).toBe(true));
    form.draft.newPerDay = 40;
    expect(await form.save()).toBe(true);
    expect((await loadSettings()).newPerDay).toBe(40);
  });

  it('does not overwrite the draft when settings change elsewhere after seeding', async () => {
    const form = useSettingsForm(['newPerDay']);
    await vi.waitFor(() => expect(form.ready.value).toBe(true));
    form.draft.newPerDay = 5;
    await useSettings().update({ newPerDay: 99 });
    expect(form.draft.newPerDay).toBe(5);
  });
});

describe('useSettingsForm on a cold start', () => {
  it('shows the defaults until the stored record loads, then re-seeds from it', async () => {
    await db.settings.put({ key: 'settings', value: { newPerDay: 33, reminderTimes: ['07:00', '21:00'] } });
    vi.resetModules();
    const { useSettingsForm: freshForm } = await import('~/composables/useSettingsForm');
    const form = freshForm(['newPerDay', 'reminderTimes']);
    expect(form.ready.value).toBe(false);
    expect(form.draft.newPerDay).toBe(15);
    await vi.waitFor(() => expect(form.ready.value).toBe(true));
    expect(form.draft.newPerDay).toBe(33);
    expect(form.draft.reminderTimes).toEqual(['07:00', '21:00']);
  });
});

describe('useSettingsForm dirty state', () => {
  it('is clean once seeded, dirty after an edit, clean again after reverting or saving', async () => {
    const { useSettingsForm: form } = await import('~/composables/useSettingsForm');
    const f = form(['newPerDay', 'reminderDays']);
    await vi.waitFor(() => expect(f.ready.value).toBe(true));
    expect(f.dirty.value).toBe(false);

    const before = f.draft.newPerDay;
    f.draft.newPerDay = before + 1;
    expect(f.dirty.value).toBe(true);
    f.draft.newPerDay = before;
    expect(f.dirty.value).toBe(false);

    f.draft.reminderDays = [1, 2];
    expect(f.dirty.value).toBe(true);
    expect(await f.save()).toBe(true);
    expect(f.dirty.value).toBe(false);
  });

  it('is not made dirty by a change saved elsewhere, such as the theme switched from the palette', async () => {
    const { useSettingsForm: form } = await import('~/composables/useSettingsForm');
    const { useSettings: settings } = await import('~/composables/useSettings');
    const f = form(['theme']);
    await vi.waitFor(() => expect(f.ready.value).toBe(true));
    await settings().update({ theme: f.draft.theme === 'dark' ? 'light' : 'dark' });
    expect(f.dirty.value).toBe(false);
  });
});
