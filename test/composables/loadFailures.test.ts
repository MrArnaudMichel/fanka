import 'fake-indexeddb/auto';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { useBrowse } from '~/composables/useBrowse';
import { useCardEditor } from '~/composables/useCardEditor';
import { useImport } from '~/composables/useImport';
import { db } from '~core/db/db';
import { cards, decks } from '~core/db/repositories';
import type { Deck } from '~core/db/schema';

/**
 * Final review I3: a rejected read must land in the composable's own
 * `error` state — never as an uncaught rejection out of a fire-and-forget
 * load or a watcher, and never as an "empty" result a page would render as
 * "No cards yet".
 */

const NOW = Date.parse('2026-09-16T08:00:00Z');

function aDeck(over: Partial<Deck> = {}): Deck {
  return {
    id: 'd1',
    name: 'HSK 1',
    description: '',
    colorToken: 'var(--chart-series-1)',
    tag: 'HSK',
    translationLang: 'en',
    createdAt: NOW,
    updatedAt: NOW,
    deletedAt: null,
    ...over,
  };
}

const unhandled: unknown[] = [];
function onUnhandled(reason: unknown): void {
  unhandled.push(reason);
}

beforeEach(async () => {
  await db.delete();
  await db.open();
  unhandled.length = 0;
  process.on('unhandledRejection', onUnhandled);
  vi.spyOn(console, 'error').mockImplementation(() => {});
});

afterEach(async () => {
  // Let any stray rejection reach the process before checking for one.
  await new Promise((resolve) => setTimeout(resolve, 10));
  process.off('unhandledRejection', onUnhandled);
  vi.restoreAllMocks();
  expect(unhandled).toEqual([]);
});

const readFailure = (): Error => new Error('Injected read failure');

describe('useBrowse', () => {
  it('sets error when the first load fails, and clears it on a successful reload', async () => {
    const list = vi.spyOn(cards, 'list').mockRejectedValueOnce(readFailure());
    const browse = useBrowse();
    await vi.waitFor(() => expect(browse.error.value).toBe(true));
    expect(browse.loading.value).toBe(false);

    await browse.reload();
    expect(browse.error.value).toBe(false);
    expect(list).toHaveBeenCalledTimes(2);
  });

  it('sets error when a filter change triggers a failing reload', async () => {
    const browse = useBrowse();
    await vi.waitFor(() => expect(browse.loading.value).toBe(false));
    expect(browse.error.value).toBe(false);

    vi.spyOn(cards, 'list').mockRejectedValueOnce(readFailure());
    browse.filter.query = 'x';
    await vi.waitFor(() => expect(browse.error.value).toBe(true));
  });
});

describe('useCardEditor', () => {
  it('sets error, not notFound, when the card read fails — and refuses to save', async () => {
    await decks.put(aDeck());
    vi.spyOn(cards, 'get').mockRejectedValueOnce(readFailure());
    const editor = useCardEditor('c1');
    await vi.waitFor(() => expect(editor.loading.value).toBe(false));

    expect(editor.error.value).toBe(true);
    expect(editor.notFound.value).toBe(false);

    editor.draft.hanzi = '你好';
    editor.draft.pinyin = 'ni3 hao3';
    editor.draft.translation = 'hello';
    expect(await editor.save()).toBe(false);
    expect(await db.cards.count()).toBe(0);
  });

  it('sets error when the deck list fails, and a retry recovers', async () => {
    await decks.put(aDeck());
    vi.spyOn(decks, 'listAll').mockRejectedValueOnce(readFailure());
    const editor = useCardEditor();
    await vi.waitFor(() => expect(editor.loading.value).toBe(false));
    expect(editor.error.value).toBe(true);

    await editor.retry();
    expect(editor.error.value).toBe(false);
    expect(editor.decks.value.map((d) => d.id)).toEqual(['d1']);
  });

  it('does not leak a rejection from the deck-change duplicate check', async () => {
    await decks.put(aDeck());
    await decks.put(aDeck({ id: 'd2', name: 'HSK 2' }));
    const editor = useCardEditor();
    await vi.waitFor(() => expect(editor.loading.value).toBe(false));

    vi.spyOn(cards, 'forDeck').mockRejectedValueOnce(readFailure());
    editor.draft.deckId = 'd2';
    await new Promise((resolve) => setTimeout(resolve, 0));
  });
});

describe('useImport', () => {
  it('sets decksError when the deck list fails, and a retry recovers', async () => {
    await decks.put(aDeck());
    vi.spyOn(decks, 'listAll').mockRejectedValueOnce(readFailure());
    const importer = useImport();

    await importer.loadDecks();
    expect(importer.decksError.value).toBe(true);
    expect(importer.decks.value).toEqual([]);

    await importer.loadDecks();
    expect(importer.decksError.value).toBe(false);
    expect(importer.decks.value.map((d) => d.id)).toEqual(['d1']);
  });
});
