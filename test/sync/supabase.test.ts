import { describe, expect, it } from 'vitest';
import type { SupabaseClient } from '@supabase/supabase-js';
import type { Deck } from '~core/db/schema';
import { createSupabaseTransport, deckFromRow, deckToRow } from '~core/sync/supabase';

/**
 * A minimal stand-in for a real Supabase table's query chain: `select`,
 * `eq`, `gt` and the first `order` are no-ops that keep the chain going
 * (this fake does its own filtering by seeding exactly the rows a real
 * `.gt(col, since)` would have matched), and `range` is where a page is
 * actually served and recorded, so a test can assert both the stitched
 * result and how many pages `pageAll` asked for.
 */
function fakeClient(tables: Record<string, Record<string, unknown>[]>): { client: SupabaseClient; rangeCalls: Record<string, { from: number; to: number }[]> } {
  const rangeCalls: Record<string, { from: number; to: number }[]> = {};
  const client = {
    from(table: string) {
      const rows = tables[table] ?? [];
      rangeCalls[table] ??= [];
      const builder = {
        select: () => builder,
        eq: () => builder,
        gt: () => builder,
        order: () => builder,
        range: (from: number, to: number) => {
          rangeCalls[table]!.push({ from, to });
          return Promise.resolve({ data: rows.slice(from, to + 1), error: null });
        },
      };
      return builder;
    },
  };
  return { client: client as unknown as SupabaseClient, rangeCalls };
}

const aDeckRow = (id: string, updatedAt: number) => ({
  id,
  user_id: 'u1',
  name: id,
  description: '',
  color_token: 'var(--chart-series-1)',
  tag: '',
  translation_lang: 'en',
  created_at: updatedAt,
  updated_at: updatedAt,
  deleted_at: null,
});

describe('createSupabaseTransport pull paging', () => {
  it('pages past the 1000-row default in one table and stitches every row', async () => {
    const rows = Array.from({ length: 1500 }, (_, i) => aDeckRow(`d${i}`, i + 1));
    const { client, rangeCalls } = fakeClient({ decks: rows, cards: [], items: [], reviews: [], attempts: [] });
    const transport = createSupabaseTransport(client, 'u1');

    const result = await transport.pull(0);

    expect(result.decks).toHaveLength(1500);
    expect(rangeCalls.decks).toEqual([{ from: 0, to: 999 }, { from: 1000, to: 1999 }]);
    expect(result.at).toBe(1500);
  });

  it('stops after one page when the table has fewer than PAGE rows', async () => {
    const rows = [aDeckRow('d1', 5), aDeckRow('d2', 9)];
    const { client, rangeCalls } = fakeClient({ decks: rows, cards: [], items: [], reviews: [], attempts: [] });
    const transport = createSupabaseTransport(client, 'u1');

    const result = await transport.pull(0);

    expect(result.decks).toHaveLength(2);
    expect(rangeCalls.decks).toEqual([{ from: 0, to: 999 }]);
  });

  it('asks one more, empty page when a table lands exactly on a page boundary', async () => {
    const rows = Array.from({ length: 1000 }, (_, i) => aDeckRow(`d${i}`, i + 1));
    const { client, rangeCalls } = fakeClient({ decks: rows, cards: [], items: [], reviews: [], attempts: [] });
    const transport = createSupabaseTransport(client, 'u1');

    const result = await transport.pull(0);

    expect(result.decks).toHaveLength(1000);
    expect(rangeCalls.decks).toEqual([{ from: 0, to: 999 }, { from: 1000, to: 1999 }]);
  });
});

describe('deck bundle mapping', () => {
  it('reads a deck row without bundle as Taiwan', () => {
    expect(deckFromRow({ ...aDeckRow('d1', 1), bundle: undefined }).bundle).toBe('taiwan');
  });

  it('reads the bundle of a deck row', () => {
    expect(deckFromRow({ ...aDeckRow('d1', 1), bundle: 'mainland' }).bundle).toBe('mainland');
  });

  it('writes the deck bundle', () => {
    const deck = deckFromRow(aDeckRow('d1', 1) as never);
    expect(deckToRow({ ...deck, bundle: 'mainland' } satisfies Deck, 'u').bundle).toBe('mainland');
  });
});
