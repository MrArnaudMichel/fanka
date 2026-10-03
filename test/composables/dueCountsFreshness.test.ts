import 'fake-indexeddb/auto';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { useBrowse } from '~/composables/useBrowse';
import { useCardEditor } from '~/composables/useCardEditor';
import { useDecks } from '~/composables/useDecks';
import { type ComputedRef, computed } from 'vue';
import { useDueCounts } from '~/composables/useDueCounts';
import { useImport } from '~/composables/useImport';
import { db } from '~core/db/db';
import { DECK_COLORS } from '~core/db/repositories';
import { seedIfNeeded } from '~core/seed/seed';

/**
 * Final review I1: the shell's due count is a module singleton, so every
 * collection write has to refresh it itself — nothing on the page calls
 * `refresh()` for it. Each test only ever reads the total after the write
 * resolves, never calls `refresh()` by hand after it. The total here sums
 * both modes, so one card counts twice: once to recognise, once to write.
 */

beforeEach(async () => {
  await db.delete();
  await db.open();
});

async function settledTotal(): Promise<ComputedRef<number>> {
  const { counts, refresh } = useDueCounts();
  await refresh();
  return computed(() => counts.value.review.total + counts.value.writing.total);
}

describe('due counts stay fresh after collection writes', () => {
  it('drops to zero once every deck is deleted', async () => {
    await seedIfNeeded(Date.now());
    const total = await settledTotal();
    expect(total.value).toBeGreaterThan(0);

    const { listAll, remove } = useDecks();
    for (const deck of await listAll()) await remove(deck.id);

    expect(total.value).toBe(0);
  });

  it('counts the new cards after an import into an empty collection', async () => {
    const deck = await useDecks().create({ name: 'Empty', description: '', colorToken: DECK_COLORS[0], tag: '' });
    const total = await settledTotal();
    expect(total.value).toBe(0);

    const importer = useImport();
    importer.targetDeckId.value = deck.id;
    await importer.load(['hanzi,pinyin,translation', '朋友,peng2 you5,friend'].join('\n'));
    await importer.verify();
    await importer.commit();

    expect(total.value).toBe(2);
  });

  it('drops to zero once Browse suspends every card', async () => {
    await seedIfNeeded(Date.now());
    const total = await settledTotal();
    expect(total.value).toBeGreaterThan(0);

    const browse = useBrowse();
    await vi.waitFor(() => expect(browse.loading.value).toBe(false));
    await browse.suspend(browse.rows.value.map((row) => row.id));

    expect(total.value).toBe(0);
  });

  it('counts a card saved from the editor', async () => {
    await useDecks().create({ name: 'Empty', description: '', colorToken: DECK_COLORS[0], tag: '' });
    const total = await settledTotal();
    expect(total.value).toBe(0);

    const editor = useCardEditor();
    await vi.waitFor(() => expect(editor.loading.value).toBe(false));
    editor.draft.hanzi = '你好';
    editor.draft.pinyin = 'ni3 hao3';
    editor.draft.translation = 'hello';
    expect(await editor.save()).toBe(true);

    expect(total.value).toBe(2);
  });
});
