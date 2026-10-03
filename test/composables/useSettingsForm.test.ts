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
