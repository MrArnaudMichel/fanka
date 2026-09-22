import 'fake-indexeddb/auto';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { useBrowse } from '~/composables/useBrowse';
import { db } from '~core/db/db';
import { cards, decks, items, reviews } from '~core/db/repositories';
import type { Card, Deck, Item } from '~core/db/schema';
import { itemId } from '~core/db/schema';

const NOW = Date.parse('2026-09-16T08:00:00Z');
const DAY = 86_400_000;

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

function aCard(over: Partial<Card> = {}): Card {
  return {
    id: 'c1',
    deckId: 'd1',
    hanzi: '學習',
    pinyin: [{ text: 'xué', tone: 2 }],
    zhuyin: '',
    translation: 'to study',
    pos: 'verb',
    example: '',
    examplePinyin: '',
    exampleTranslation: '',
    tags: [],
    note: '',
    createdAt: NOW,
    updatedAt: NOW,
    deletedAt: null,
    ...over,
  };
}

beforeEach(async () => {
  await db.delete();
  await db.open();
});

/** `useBrowse` fires its own first `reload()` immediately, outside any Vue lifecycle — this waits for it to settle. */
async function ready(browse: ReturnType<typeof useBrowse>): Promise<void> {
  await vi.waitFor(() => expect(browse.loading.value).toBe(false));
}

function ids(rows: ReturnType<typeof useBrowse>['rows']['value']): string[] {
  return rows.map((r) => r.card.id);
}

describe('useBrowse', () => {
  it('combines the deck, state, direction and query filters with AND', async () => {
    await decks.put(aDeck({ id: 'd1' }));
    await decks.put(aDeck({ id: 'd2', name: 'HSK 2' }));

    // Every card but c1 fails exactly one of the four filters below — so if
    // any single filter were dropped, a different card would leak in and
    // the final assertion would catch it.
    // c1: d1, new, recognition, "greet" — matches every filter.
    await cards.create(aCard({ id: 'c1', hanzi: '你好', translation: 'greeting: hello' }), ['recognition', 'production'], NOW);
    // c2: matches deck/direction/query, but is not `new` — the state filter alone excludes it.
    await cards.create(aCard({ id: 'c2', deckId: 'd1', hanzi: '謝謝', translation: 'greeting: thanks' }), ['recognition'], NOW);
    await items.put({ ...(await items.get(itemId('c2', 'recognition')))!, state: 'review' });
    // c3: matches deck/state/query, but is production-only — the direction filter alone excludes it.
    await cards.create(aCard({ id: 'c3', deckId: 'd1', hanzi: '再見', translation: 'greeting: goodbye' }), ['production'], NOW);
    // c4: matches state/direction/query, but lives in d2 — the deck filter alone excludes it.
    await cards.create(aCard({ id: 'c4', deckId: 'd2', hanzi: '你好嗎', translation: 'greeting: how are you' }), ['recognition', 'production'], NOW);
    // c5: matches deck/state/direction, but its translation has no "greet" — the query filter alone excludes it.
    await cards.create(aCard({ id: 'c5', deckId: 'd1', hanzi: '謝謝你', translation: 'thanks a lot' }), ['recognition', 'production'], NOW);

    const browse = useBrowse();
    await ready(browse);

    browse.filter.deckId = 'd1';
    browse.filter.state = 'new';
    browse.filter.dir = 'recognition';
    browse.filter.query = 'greet';
    await browse.reload();

    expect(ids(browse.rows.value)).toEqual(['c1']);
  });

  it('reacts to a filter change on its own, without an explicit reload', async () => {
    await decks.put(aDeck());
    await cards.create(aCard({ id: 'c1', translation: 'to study' }), ['recognition'], NOW);
    await cards.create(aCard({ id: 'c2', hanzi: '你好', translation: 'hello' }), ['recognition'], NOW);

    const browse = useBrowse();
    await ready(browse);
    expect(ids(browse.rows.value).sort()).toEqual(['c1', 'c2']);

    browse.filter.query = 'hello';
    await vi.waitFor(() => expect(ids(browse.rows.value)).toEqual(['c2']));
  });

  it('a bulk suspend updates the affected rows', async () => {
    await decks.put(aDeck());
    await cards.create(aCard({ id: 'c1' }), ['recognition', 'production'], NOW);
    await cards.create(aCard({ id: 'c2', hanzi: '你好', translation: 'hello' }), ['recognition'], NOW);

    const browse = useBrowse();
    await ready(browse);

    await browse.suspend(['c1']);
    await browse.reload();

    const row = browse.rows.value.find((r) => r.card.id === 'c1');
    expect(row?.state).toBe('suspended');
    // c2 is untouched.
    expect(browse.rows.value.find((r) => r.card.id === 'c2')?.state).toBe('new');
  });

  it('a bulk unsuspend reverses it', async () => {
    await decks.put(aDeck());
    await cards.create(aCard({ id: 'c1' }), ['recognition'], NOW);

    const browse = useBrowse();
    await ready(browse);

    await browse.suspend(['c1']);
    await browse.unsuspend(['c1']);
    await browse.reload();

    expect(browse.rows.value.find((r) => r.card.id === 'c1')?.state).toBe('new');
  });

  it('a bulk delete removes rows, and they no longer surface in items.due()', async () => {
    await decks.put(aDeck());
    await cards.create(aCard({ id: 'c1' }), ['recognition'], NOW);
    const dueItem: Item = { ...(await items.get(itemId('c1', 'recognition')))!, state: 'review', due: NOW - DAY };
    await items.put(dueItem);

    const browse = useBrowse();
    await ready(browse);
    expect(ids(browse.rows.value)).toEqual(['c1']);
    expect((await items.due(NOW)).map((i) => i.id)).toEqual([dueItem.id]);

    await browse.remove(['c1']);
    await browse.reload();

    expect(browse.rows.value).toEqual([]);
    expect(await items.due(NOW)).toEqual([]);
  });

  it('history returns reviews oldest first', async () => {
    await decks.put(aDeck());
    await cards.create(aCard({ id: 'c1' }), ['recognition'], NOW);
    const item = (await items.get(itemId('c1', 'recognition')))!;

    // Recorded out of chronological order, on purpose.
    await reviews.record({ item, before: item, grade: 3, reviewedAt: NOW + 2 * DAY, durationMs: 1000 });
    await reviews.record({ item, before: item, grade: 1, reviewedAt: NOW, durationMs: 1000 });
    await reviews.record({ item, before: item, grade: 4, reviewedAt: NOW + DAY, durationMs: 1000 });

    const browse = useBrowse();
    await ready(browse);

    const history = await browse.history('c1');
    expect(history.map((r) => r.reviewedAt)).toEqual([NOW, NOW + DAY, NOW + 2 * DAY]);
  });

  it('scoping to a deck ignores the deck filter', async () => {
    await decks.put(aDeck({ id: 'd1' }));
    await decks.put(aDeck({ id: 'd2', name: 'HSK 2' }));
    await cards.create(aCard({ id: 'c1', deckId: 'd1' }), ['recognition'], NOW);
    await cards.create(aCard({ id: 'c2', deckId: 'd2', hanzi: '你好', translation: 'hello' }), ['recognition'], NOW);

    const browse = useBrowse({ deckId: 'd1' });
    await ready(browse);
    expect(ids(browse.rows.value)).toEqual(['c1']);

    // Setting the filter's own deckId must not leak d2's card in, nor drop d1's.
    browse.filter.deckId = 'd2';
    await browse.reload();

    expect(ids(browse.rows.value)).toEqual(['c1']);
  });
});
