import { describe, expect, it, vi } from 'vitest';
import type { CardRow } from '~core/db/repositories';

/**
 * `useBrowse.reload()` in isolation from Dexie: `cards.list` is a `vi.fn`
 * whose promise this test resolves by hand, in whichever order it likes —
 * the only way to make a slower, older request's response land *after* a
 * faster, newer one's, deterministically, without a real timer race.
 * `decks`/`items`/`reviews` are stubbed out because `useBrowse.reload()`
 * never touches them; nothing else in this file needs them either.
 */
const { list, pending } = vi.hoisted(() => {
  const pending: { resolve: (rows: CardRow[]) => void }[] = [];
  const list = vi.fn(() => new Promise<CardRow[]>((resolve) => pending.push({ resolve })));
  return { list, pending };
});

vi.mock('~core/db/repositories', () => ({
  cards: { list },
  items: {},
  decks: {},
  reviews: {},
}));

function aRow(id: string, hanzi: string): CardRow {
  return {
    card: {
      id,
      deckId: 'd1',
      hanzi,
      pinyin: [],
      zhuyin: '',
      translation: id,
      pos: 'noun',
      example: '',
      examplePinyin: '',
      exampleTranslation: '',
      tags: [],
      note: '',
      createdAt: 0,
      updatedAt: 0,
      deletedAt: null,
    },
    deckName: 'HSK 1',
    items: [],
    state: 'new',
    due: null,
  };
}

describe('useBrowse().reload — request sequencing', () => {
  it('a slower, older request must not overwrite a faster, newer one', async () => {
    const { useBrowse } = await import('~/composables/useBrowse');
    const browse = useBrowse();

    // The constructor's own first call — the "older" request. Left
    // unresolved for now, so it is still in flight when the next one starts.
    await vi.waitFor(() => expect(pending).toHaveLength(1));
    const older = pending[0]!;

    // A second, independent call — the "newer" request (e.g. the filter
    // watcher firing again before the first reload settled).
    const second = browse.reload();
    await vi.waitFor(() => expect(pending).toHaveLength(2));
    const newer = pending[1]!;

    // Resolve the newer request first — it is faster, not just later.
    newer.resolve([aRow('newer', '新')]);
    await second;
    expect(browse.rows.value.map((r) => r.card.id)).toEqual(['newer']);

    // The older request finally resolves. Its rows must be discarded: a
    // newer request has already applied its own.
    older.resolve([aRow('older', '舊')]);
    await vi.waitFor(() => expect(list).toHaveBeenCalledTimes(2)); // both calls happened
    await new Promise((resolve) => setTimeout(resolve, 0)); // let the older's `.then` run
    expect(browse.rows.value.map((r) => r.card.id)).toEqual(['newer']);
    expect(browse.loading.value).toBe(false);
  });
});
