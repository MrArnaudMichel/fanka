import type { KtSortDirection } from 'kanto';
import { type CardRow, cards, items, reviews } from '~core/db/repositories';
import type { Card, Direction, Item, Review } from '~core/db/schema';
import type { ItemState } from '~core/srs';

export type BrowseState = ItemState | 'suspended';

export interface BrowseFilter {
  deckId: string | null;
  state: BrowseState | null;
  dir: Direction | null;
  query: string;
}

export interface BrowseSort {
  key: string | null;
  direction: KtSortDirection;
}

/**
 * One card, shaped for `kt-table`. Everything but `hanzi` is the real value
 * — `renderCell` reads `card`/`items` directly for display. `hanzi` is not
 * the hanzi text: it is that card's rank in ascending zh-Hant order among
 * the current rows. `kt-table` always re-sorts its own `data` through a
 * plain `Intl.Collator('en', …)` the moment a sortable column's `sortKey` is
 * set (see kt-table.ts's `sortedRows`), which has no notion of zh-Hant
 * collation and would scramble real hanzi text. A rank is a number, so it
 * takes kt-table's *numeric* comparison branch instead of the text one —
 * `(left - right) * sign` reproduces the zh-Hant order exactly, ascending or
 * descending, without fighting or duplicating kt-table's own sort mechanism.
 */
export interface BrowseRow {
  id: string;
  card: Card;
  deckName: string;
  items: Item[];
  state: BrowseState;
  due: number | null;
  hanzi: number;
  /**
   * The real translation text, at the top level — unlike `hanzi`, `kt-table`
   * reading it straight (its generic collator, English text) is exactly
   * right, and `CardTable`'s `renderCell` never overrides this column, so
   * it also has to double as the value the table's own empty-cell fallback
   * renders.
   */
  translation: string;
}

/** Label and badge tone for each row state — shared by `CardTable`'s State column and `CardDetailPanel`'s badge, so the two can never quietly disagree. */
export const STATE_META: Record<BrowseState, { label: string; tone: 'neutral' | 'info' | 'warning' | 'success' }> = {
  new: { label: 'New', tone: 'neutral' },
  learning: { label: 'Learning', tone: 'info' },
  relearning: { label: 'Relearning', tone: 'warning' },
  review: { label: 'Review', tone: 'success' },
  suspended: { label: 'Suspended', tone: 'neutral' },
};

/**
 * The Browse screen's one seam into the database (see CLAUDE.md: "pages
 * never touch Dexie directly"). `scope` fixes the deck the way Task 13's
 * deck detail screen needs — `filter.deckId` is then never read, so a caller
 * that also happens to set it cannot leak cards from another deck into a
 * scoped table.
 *
 * Sort state lives here, keyed by column `key` and `direction`, rather than
 * as local state in `CardTable.vue` — `rows` is already in the right order
 * for whichever column is active, `zh-Hant`-correct for hanzi and with a
 * `null` due sorting last, so `CardTable` only ever has to render what it is
 * given.
 */
export function useBrowse(scope?: { deckId: string }) {
  const filter = reactive<BrowseFilter>({ deckId: scope?.deckId ?? null, state: null, dir: null, query: '' });
  const sort = ref<BrowseSort>({ key: null, direction: null });
  const raw = ref<CardRow[]>([]);
  const selected = ref<string[]>([]);
  const loading = ref(true);

  async function reload(): Promise<void> {
    loading.value = true;
    try {
      raw.value = await cards.list({
        deckId: scope?.deckId ?? filter.deckId ?? undefined,
        state: filter.state ?? undefined,
        dir: filter.dir ?? undefined,
        query: filter.query.trim() || undefined,
        now: Date.now(),
      });
    } finally {
      loading.value = false;
    }
  }

  void reload();

  // Any filter change re-queries the repository; `sort` never does — it only
  // ever reorders whatever `raw` already holds (see `rows` below).
  watch(filter, reload, { deep: true });

  /** Ascending zh-Hant order over the current rows, as a stable rank per card id. */
  const hanziRank = computed<Map<string, number>>(() => {
    const order = [...raw.value].sort((a, b) => a.card.hanzi.localeCompare(b.card.hanzi, 'zh-Hant'));
    return new Map(order.map((row, i) => [row.card.id, i]));
  });

  function compareRows(a: CardRow, b: CardRow, key: string): number {
    if (key === 'hanzi') return a.card.hanzi.localeCompare(b.card.hanzi, 'zh-Hant');
    if (key === 'due') {
      if (a.due === null && b.due === null) return 0;
      if (a.due === null) return 1;
      if (b.due === null) return -1;
      return a.due - b.due;
    }
    if (key === 'translation') return a.card.translation.localeCompare(b.card.translation);
    if (key === 'deckName') return a.deckName.localeCompare(b.deckName);
    if (key === 'state') return a.state.localeCompare(b.state);
    return 0;
  }

  /**
   * The default (unsorted) order, before any header is clicked. Once a
   * column is active, `kt-table`'s own resort takes over the *displayed*
   * order — see `BrowseRow`'s comment — so this only has to agree with it,
   * which `compareRows` does for every column above.
   */
  const rows = computed<BrowseRow[]>(() => {
    const { key, direction } = sort.value;
    const ordered = key && direction ? [...raw.value].sort((a, b) => compareRows(a, b, key) * (direction === 'asc' ? 1 : -1)) : raw.value;
    return ordered.map((row) => ({
      id: row.card.id,
      card: row.card,
      deckName: row.deckName,
      items: row.items,
      state: row.state,
      due: row.due,
      hanzi: hanziRank.value.get(row.card.id) ?? 0,
      translation: row.card.translation,
    }));
  });

  function setSort(key: string | null, direction: KtSortDirection): void {
    sort.value = { key, direction };
  }

  function clearFilters(): void {
    filter.state = null;
    filter.dir = null;
    filter.query = '';
    if (!scope) filter.deckId = null;
  }

  /** Item ids for every direction of the given cards — what `items.setSuspended` needs. */
  function itemIdsFor(cardIds: readonly string[]): string[] {
    const wanted = new Set(cardIds);
    return raw.value.filter((row) => wanted.has(row.card.id)).flatMap((row) => row.items.map((item) => item.id));
  }

  async function suspend(cardIds: string[]): Promise<void> {
    await items.setSuspended(itemIdsFor(cardIds), true, Date.now());
  }

  async function unsuspend(cardIds: string[]): Promise<void> {
    await items.setSuspended(itemIdsFor(cardIds), false, Date.now());
  }

  async function move(cardIds: string[], deckId: string): Promise<void> {
    await cards.move(cardIds, deckId, Date.now());
  }

  async function remove(cardIds: string[]): Promise<void> {
    await cards.softDelete(cardIds, Date.now());
  }

  function history(cardId: string): Promise<Review[]> {
    return reviews.historyForCard(cardId);
  }

  return { rows, filter, sort, setSort, clearFilters, selected, loading, reload, suspend, unsuspend, move, remove, history };
}
