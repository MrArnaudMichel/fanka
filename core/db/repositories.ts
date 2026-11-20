import { activeBundle, deckInScope } from './bundle-scope';
import { buildAttempt } from './attempts';
import { db } from './db';
import { type Attempt, type AttemptDetail, type AttemptSource, type Card, type Deck, type Direction, type Item, type OutboxEntry, type Review, SELF_GRADED, itemId } from './schema';
import type { Bundle } from '~core/chinese/script';
import { toZhuyin } from '~core/chinese/zhuyin';
import { compareNames, lessonOf } from '~core/lessons';
import { type Grade, type ItemState, type SrsState, newSrsState } from '~core/srs';
import { MATURE_DAYS as MATURE_SCHEDULED_DAYS } from '~core/stats/memory';
import type { StatsSnapshot } from '~core/stats/filter';

function uid(): string {
  return crypto.randomUUID();
}

function outboxEntry(entity: OutboxEntry['entity'], entityId: string, op: OutboxEntry['op'], at: number): OutboxEntry {
  return { id: uid(), entity, entityId, op, at };
}

/** Indexes bulkGet results by id, dropping the gaps for keys that missed. */
function byId<T extends { id: string }>(rows: (T | undefined)[]): Map<string, T> {
  const map = new Map<string, T>();
  for (const row of rows) {
    if (row) map.set(row.id, row);
  }
  return map;
}

/** An item is visible only while both its card and that card's deck are live. */
function cardVisible(card: Card | undefined, decksById: Map<string, Deck>): boolean {
  if (!card || card.deletedAt !== null) return false;
  const deck = decksById.get(card.deckId);
  return deck !== undefined && deckInScope(deck);
}

/** Whether the card belongs to one of `deckIds`; no set means every deck. */
function inDecks(card: Card | undefined, deckIds: ReadonlySet<string> | undefined): boolean {
  return !deckIds || (card !== undefined && deckIds.has(card.deckId));
}

/** decksById for the distinct decks referenced by the given cards. */
async function decksByIdFor(cardsById: Map<string, Card>): Promise<Map<string, Deck>> {
  const deckIds = [...new Set([...cardsById.values()].map((c) => c.deckId))];
  return byId(await db.decks.bulkGet(deckIds));
}

const ALL_DIRECTIONS: Direction[] = ['recognition', 'production'];

/** Indexes a card's items by direction. A card has at most one item per direction. */
function byDir(cardItems: Item[]): Map<Direction, Item> {
  return new Map(cardItems.map((i) => [i.dir, i]));
}

/**
 * The palette a deck's `colorToken` may be set to. It feeds a Kanto `style`
 * binding directly, so an imported file (or any other untrusted input) must
 * never be able to inject an arbitrary CSS value through it — every writer
 * of `colorToken` checks against this set first.
 */
export const DECK_COLORS = [
  'var(--chart-series-1)',
  'var(--chart-series-2)',
  'var(--chart-series-3)',
  'var(--chart-series-4)',
  'var(--chart-series-5)',
  'var(--chart-series-6)',
  'var(--chart-series-7)',
  'var(--chart-series-8)',
] as const;
export type DeckColor = (typeof DECK_COLORS)[number];

function assertDeckColor(colorToken: string): asserts colorToken is DeckColor {
  if (!(DECK_COLORS as readonly string[]).includes(colorToken)) {
    throw new Error(`not a deck colour: ${colorToken}`);
  }
}

/**
 * Drops keys whose value is `undefined` from a patch before it is spread
 * onto an existing row. `{ ...row, ...patch }` cannot tell "key omitted"
 * from "key present with value `undefined`" — both look identical once
 * spread — so a patch built as `{ colorToken: undefined, name: 'x' }` would
 * otherwise blank out a required field. Every patch that gets merged this
 * way must be run through this first.
 */
function definedOnly<T extends object>(patch: T): Partial<T> {
  const result: Partial<T> = {};
  for (const key of Object.keys(patch) as (keyof T)[]) {
    if (patch[key] !== undefined) result[key] = patch[key];
  }
  return result;
}

export interface DeckSummary {
  deck: Deck;
  total: number;
  due: number;
  fresh: number;
  mature: number;
  young: number;
}

/** A card's row `state` is its least-advanced unsuspended item's state; `new` < `learning` = `relearning` < `review`. */
const STATE_RANK: Record<ItemState, number> = { new: 0, learning: 1, relearning: 1, review: 2 };

export interface CardFilter {
  deckId?: string;
  /** The decks whose tag is this lesson; see `~core/lessons`. */
  lesson?: string;
  state?: ItemState | 'suspended';
  dir?: Direction;
  query?: string;
  now: number;
}

export interface CardRow {
  card: Card;
  deckName: string;
  items: Item[];
  state: ItemState | 'suspended';
  due: number | null;
}

export type CardPatch = Partial<
  Pick<
    Card,
    'hanzi' | 'pinyin' | 'zhuyin' | 'translation' | 'pos' | 'example' | 'examplePinyin' | 'exampleTranslation' | 'tags' | 'note' | 'deckId'
  >
>;

/**
 * A row's `state` ignores suspended items entirely, and is `suspended` only
 * once every item is; `due` is the soonest unsuspended item's due, or null
 * when none exists. Shared by `cards.list` and nowhere else yet, but kept
 * standalone so a future caller (e.g. deck detail) computes the same thing
 * rather than re-deriving its own rule.
 */
function rowStateAndDue(cardItems: Item[]): { state: ItemState | 'suspended'; due: number | null } {
  const active = cardItems.filter((i) => !i.suspended);
  if (active.length === 0) return { state: 'suspended', due: null };
  let state = active[0]!.state;
  let due = active[0]!.due;
  for (const item of active) {
    if (STATE_RANK[item.state] < STATE_RANK[state]) state = item.state;
    if (item.due < due) due = item.due;
  }
  return { state, due };
}

const TONE_MARK_RE = new RegExp('[\u0300-\u036f]', 'g');

/** Strips tone marks, tone digits and whitespace, and lowercases, so pinyin can be matched toneless. */
function toneless(text: string): string {
  return text
    .normalize('NFD')
    .replace(TONE_MARK_RE, '')
    .replace(/[1-5]/g, '')
    .replace(/\s+/g, '')
    .toLowerCase();
}

function matchesQuery(card: Card, trimmedQuery: string): boolean {
  const lower = trimmedQuery.toLowerCase();
  if (card.hanzi.toLowerCase().includes(lower)) return true;
  if (card.translation.toLowerCase().includes(lower)) return true;
  const tonelessQuery = toneless(trimmedQuery);
  if (tonelessQuery.length === 0) return false;
  const pinyinText = card.pinyin.map((s) => s.text).join(' ');
  return toneless(pinyinText).includes(tonelessQuery);
}

/** Same syllables, same tones, same order — used to tell a real pinyin edit from a patch that just echoes the stored value back. */
function pinyinEqual(a: Card['pinyin'], b: Card['pinyin']): boolean {
  return a.length === b.length && a.every((syllable, i) => syllable.text === b[i]!.text && syllable.tone === b[i]!.tone);
}

export const decks = {
  get: (id: string) => db.decks.get(id),

  async put(deck: Deck): Promise<void> {
    // The outbox entry is written inside the same transaction as the change,
    // so a crash between the two is not possible and no mutation is lost.
    await db.transaction('rw', db.decks, db.outbox, async () => {
      await db.decks.put(deck);
      await db.outbox.put(outboxEntry('deck', deck.id, 'put', deck.updatedAt));
    });
  },

  async listAll(): Promise<Deck[]> {
    const all = await db.decks.toArray();
    return all.filter(deckInScope).sort((a, b) => compareNames(a.name, b.name));
  },

  async create(input: { name: string; description: string; colorToken: DeckColor; tag: string; bundle: Bundle }, now: number): Promise<Deck> {
    assertDeckColor(input.colorToken);
    const deck: Deck = {
      id: uid(),
      name: input.name,
      description: input.description,
      colorToken: input.colorToken,
      tag: input.tag,
      bundle: input.bundle,
      // Not part of the brief's input; every existing deck (seed included)
      // is English, so this is the one sane default rather than a required
      // field nothing in this task's UI collects yet.
      translationLang: 'en',
      createdAt: now,
      updatedAt: now,
      deletedAt: null,
    };
    await db.transaction('rw', db.decks, db.outbox, async () => {
      await db.decks.put(deck);
      await db.outbox.put(outboxEntry('deck', deck.id, 'put', now));
    });
    return deck;
  },

  async update(id: string, patch: Partial<Pick<Deck, 'name' | 'description' | 'colorToken' | 'tag'>>, now: number): Promise<void> {
    if (patch.colorToken !== undefined) assertDeckColor(patch.colorToken);
    const safePatch = definedOnly(patch);
    await db.transaction('rw', db.decks, db.outbox, async () => {
      const deck = await db.decks.get(id);
      if (!deck) throw new Error(`no such deck: ${id}`);
      await db.decks.put({ ...deck, ...safePatch, updatedAt: now });
      await db.outbox.put(outboxEntry('deck', id, 'put', now));
    });
  },

  /**
   * Marks only the deck. Its cards become invisible through the existing
   * deck visibility that `cardVisible`/`decksByIdFor` already enforce for
   * `items.due`/`fresh`/`visible` and for `cards.list` — nothing there needs
   * to change to honour a soft-deleted deck.
   */
  async softDelete(id: string, now: number): Promise<void> {
    await db.transaction('rw', db.decks, db.outbox, async () => {
      const deck = await db.decks.get(id);
      if (!deck) throw new Error(`no such deck: ${id}`);
      await db.decks.put({ ...deck, deletedAt: now, updatedAt: now });
      await db.outbox.put(outboxEntry('deck', id, 'put', now));
    });
  },

  /**
   * One summary per live deck, built from a single scan of cards and items
   * rather than N+1 queries per deck. `total` counts visible cards, not
   * items; `due`/`fresh`/`mature`/`young` count unsuspended items only, per
   * the same visibility rule `cardVisible` applies everywhere else.
   */
  async summaries(now: number): Promise<DeckSummary[]> {
    const allDecks = await db.decks.toArray();
    const decksById = byId(allDecks);
    const liveDecks = allDecks.filter(deckInScope).sort((a, b) => compareNames(a.name, b.name));

    const visibleCards = (await db.cards.toArray()).filter((c) => cardVisible(c, decksById));
    const cardsByDeck = new Map<string, Card[]>();
    for (const card of visibleCards) {
      const list = cardsByDeck.get(card.deckId) ?? [];
      list.push(card);
      cardsByDeck.set(card.deckId, list);
    }

    const visibleCardIds = new Set(visibleCards.map((c) => c.id));
    const itemsByCard = new Map<string, Item[]>();
    for (const item of await db.items.toArray()) {
      if (!visibleCardIds.has(item.cardId)) continue;
      const list = itemsByCard.get(item.cardId) ?? [];
      list.push(item);
      itemsByCard.set(item.cardId, list);
    }

    return liveDecks.map((deck) => {
      const deckCards = cardsByDeck.get(deck.id) ?? [];
      let due = 0;
      let fresh = 0;
      let mature = 0;
      let young = 0;
      for (const card of deckCards) {
        for (const item of itemsByCard.get(card.id) ?? []) {
          if (item.suspended) continue;
          if (item.state === 'new') {
            fresh += 1;
            continue;
          }
          if (item.due <= now) due += 1;
          if (item.state === 'review' && item.scheduledDays > MATURE_SCHEDULED_DAYS) mature += 1;
          else young += 1;
        }
      }
      return { deck, total: deckCards.length, due, fresh, mature, young };
    });
  },
};

export const cards = {
  get: (id: string) => db.cards.get(id),

  async create(card: Card, directions: Direction[], now: number): Promise<void> {
    await db.transaction('rw', db.cards, db.items, db.outbox, async () => {
      await db.cards.put(card);
      await db.outbox.put(outboxEntry('card', card.id, 'put', now));
      for (const dir of directions) {
        const item: Item = {
          ...newSrsState(now),
          id: itemId(card.id, dir),
          cardId: card.id,
          dir,
          suspended: false,
          updatedAt: now,
        };
        await db.items.put(item);
        await db.outbox.put(outboxEntry('item', item.id, 'put', now));
      }
    });
  },

  async forDeck(deckId: string): Promise<Card[]> {
    const all = await db.cards.where('deckId').equals(deckId).toArray();
    return all.filter((c) => c.deletedAt === null);
  },

  /**
   * Patches the card's content and reconciles its items against the given
   * directions, all in one transaction:
   * - a newly enabled direction with an existing (suspended) item is
   *   un-suspended, never duplicated;
   * - a newly enabled direction with no item gets a fresh one;
   * - a disabled direction's item is suspended, never deleted, so its
   *   review history survives a later re-enable.
   *
   * `directions` must be non-empty — a card with no direction cannot be
   * reviewed at all, so that is a caller error, not a valid state to save.
   * `null` means "leave the items alone": no item is created, suspended or
   * un-suspended. That keeps an edit's content change separate from the
   * card's suspension, which Browse's Suspend/Unsuspend own — an editor
   * that re-sent the toggles it loaded would otherwise un-suspend (or fail
   * to save) a card that Browse suspended.
   */
  async update(id: string, patch: CardPatch, directions: Direction[] | null, now: number): Promise<void> {
    if (directions !== null && directions.length === 0) throw new Error('a card needs at least one direction');
    const enabled = directions === null ? null : new Set(directions);

    await db.transaction('rw', db.cards, db.items, db.decks, db.outbox, async () => {
      const card = await db.cards.get(id);
      if (!card) throw new Error(`no such card: ${id}`);

      let deckId = card.deckId;
      if (patch.deckId !== undefined && patch.deckId !== card.deckId) {
        const targetDeck = await db.decks.get(patch.deckId);
        if (!targetDeck || targetDeck.deletedAt !== null) throw new Error(`no such deck: ${patch.deckId}`);
        deckId = patch.deckId;
      }

      const pinyinChanged = patch.pinyin !== undefined && !pinyinEqual(patch.pinyin, card.pinyin);
      const zhuyin = pinyinChanged && patch.zhuyin === undefined ? toZhuyin(patch.pinyin!) : patch.zhuyin;

      const safePatch = definedOnly(patch);
      const updated: Card = { ...card, ...safePatch, deckId, ...(zhuyin !== undefined ? { zhuyin } : {}), updatedAt: now };
      await db.cards.put(updated);
      await db.outbox.put(outboxEntry('card', id, 'put', now));

      if (enabled === null) return;
      const existingByDir = byDir(await db.items.where('cardId').equals(id).toArray());
      for (const dir of ALL_DIRECTIONS) {
        const existing = existingByDir.get(dir);
        if (enabled.has(dir)) {
          if (!existing) {
            const fresh: Item = { ...newSrsState(now), id: itemId(id, dir), cardId: id, dir, suspended: false, updatedAt: now };
            await db.items.put(fresh);
            await db.outbox.put(outboxEntry('item', fresh.id, 'put', now));
          } else if (existing.suspended) {
            const revived: Item = { ...existing, suspended: false, updatedAt: now };
            await db.items.put(revived);
            await db.outbox.put(outboxEntry('item', revived.id, 'put', now));
          }
        } else if (existing && !existing.suspended) {
          const suspended: Item = { ...existing, suspended: true, updatedAt: now };
          await db.items.put(suspended);
          await db.outbox.put(outboxEntry('item', suspended.id, 'put', now));
        }
      }
    });
  },

  /** One transaction for every id, so a bulk soft-delete either fully lands or fully doesn't. */
  async softDelete(ids: string[], now: number): Promise<void> {
    await db.transaction('rw', db.cards, db.outbox, async () => {
      const found = (await db.cards.bulkGet(ids)).filter((c): c is Card => Boolean(c));
      for (const card of found) {
        await db.cards.put({ ...card, deletedAt: now, updatedAt: now });
        await db.outbox.put(outboxEntry('card', card.id, 'put', now));
      }
    });
  },

  /**
   * Throws, and moves nothing, if the target deck is unknown or soft-deleted
   * — one transaction for every id. A card whose trimmed hanzi the target
   * deck's visible cards already have is skipped, never moved: a deck holds
   * one card per hanzi, and the editor would otherwise refuse to save either
   * copy ("Already in this deck"). The check grows as cards move, so the
   * second of two moved cards sharing a hanzi is skipped too. A card already
   * in the target deck counts as moved, with nothing to write.
   */
  async move(ids: string[], deckId: string, now: number): Promise<{ moved: number; skipped: number }> {
    let moved = 0;
    let skipped = 0;
    await db.transaction('rw', db.cards, db.decks, db.outbox, async () => {
      const targetDeck = await db.decks.get(deckId);
      if (!targetDeck || targetDeck.deletedAt !== null) throw new Error(`no such deck: ${deckId}`);
      const found = (await db.cards.bulkGet(ids)).filter((c): c is Card => Boolean(c));
      const deckCards = await db.cards.where('deckId').equals(deckId).toArray();
      const taken = new Set(deckCards.filter((c) => c.deletedAt === null).map((c) => c.hanzi.trim()));

      for (const card of found) {
        if (card.deckId === deckId) {
          moved += 1;
          continue;
        }
        const hanzi = card.hanzi.trim();
        if (taken.has(hanzi)) {
          skipped += 1;
          continue;
        }
        taken.add(hanzi);
        await db.cards.put({ ...card, deckId, updatedAt: now });
        await db.outbox.put(outboxEntry('card', card.id, 'put', now));
        moved += 1;
      }
    });
    return { moved, skipped };
  },

  /**
   * `state`, `dir`, `deckId`, `lesson` and `query` combine with AND. `state`/`due` are
   * computed by the same `rowStateAndDue` rule everywhere, so a row never
   * disagrees with itself between filters.
   */
  async list(filter: CardFilter): Promise<CardRow[]> {
    const allDecks = await db.decks.toArray();
    const decksById = byId(allDecks);

    let candidates = (await db.cards.toArray()).filter((c) => cardVisible(c, decksById));
    if (filter.deckId !== undefined) {
      candidates = candidates.filter((c) => c.deckId === filter.deckId);
    }
    if (filter.lesson !== undefined) {
      candidates = candidates.filter((c) => lessonOf(decksById.get(c.deckId)!) === filter.lesson);
    }
    const trimmedQuery = filter.query?.trim() ?? '';
    if (trimmedQuery.length > 0) {
      candidates = candidates.filter((c) => matchesQuery(c, trimmedQuery));
    }

    const itemsByCard = new Map<string, Item[]>();
    for (const item of await db.items.toArray()) {
      const list = itemsByCard.get(item.cardId) ?? [];
      list.push(item);
      itemsByCard.set(item.cardId, list);
    }

    const rows: CardRow[] = [];
    for (const card of candidates) {
      const cardItems = itemsByCard.get(card.id) ?? [];
      const { state, due } = rowStateAndDue(cardItems);
      if (filter.state !== undefined && state !== filter.state) continue;
      if (filter.dir !== undefined && !cardItems.some((i) => i.dir === filter.dir && !i.suspended)) continue;
      rows.push({ card, deckName: decksById.get(card.deckId)?.name ?? '', items: cardItems, state, due });
    }
    return rows;
  },
};

export const items = {
  get: (id: string) => db.items.get(id),

  async put(item: Item): Promise<void> {
    await db.transaction('rw', db.items, db.outbox, async () => {
      await db.items.put(item);
      await db.outbox.put(outboxEntry('item', item.id, 'put', item.updatedAt));
    });
  },

  forCard: (cardId: string) => db.items.where('cardId').equals(cardId).toArray(),

  /**
   * Due, already introduced, not suspended, and belonging to a card and deck
   * that are both still live — soonest first. A soft-deleted card or deck
   * must never surface a review, so this always re-checks both, not just
   * `suspended`. `dir` narrows it to one direction — Review and Writing
   * each work through their own. `deckIds`, when given, narrows it to the
   * decks being studied.
   */
  async due(now: number, dir?: Direction, deckIds?: ReadonlySet<string>): Promise<Item[]> {
    const candidates = (await db.items.where('due').belowOrEqual(now).toArray()).filter(
      (i) => !i.suspended && i.state !== 'new' && (!dir || i.dir === dir),
    );
    const cardsById = byId(await db.cards.bulkGet(candidates.map((i) => i.cardId)));
    const decksById = await decksByIdFor(cardsById);
    return candidates
      .filter((i) => cardVisible(cardsById.get(i.cardId), decksById) && inDecks(cardsById.get(i.cardId), deckIds))
      .sort((a, b) => a.due - b.due);
  },

  /**
   * Never-seen items, oldest card first, so a deck is learned in its order.
   * Excludes items whose card or deck is soft-deleted, same as `due()`, and
   * narrows to `dir` and `deckIds` the same way — before `limit` applies,
   * so the allowance is filled from the studied decks alone.
   */
  async fresh(limit: number, dir?: Direction, deckIds?: ReadonlySet<string>): Promise<Item[]> {
    const candidates = (await db.items.where('state').equals('new').toArray()).filter(
      (i) => !i.suspended && (!dir || i.dir === dir),
    );
    const cardsById = byId(await db.cards.bulkGet(candidates.map((i) => i.cardId)));
    const decksById = await decksByIdFor(cardsById);
    return candidates
      .filter((i) => cardVisible(cardsById.get(i.cardId), decksById) && inDecks(cardsById.get(i.cardId), deckIds))
      .sort((a, b) => (cardsById.get(a.cardId)?.createdAt ?? 0) - (cardsById.get(b.cardId)?.createdAt ?? 0))
      .slice(0, limit);
  },

  /**
   * Every item endless practice can draw from in one direction: due or not,
   * new or not, as long as it is not suspended and its card and deck are live
   * — narrowed to `deckIds` when given, like `due()` and `fresh()`.
   */
  async pool(dir: Direction, deckIds?: ReadonlySet<string>): Promise<Item[]> {
    const candidates = (await db.items.toArray()).filter((i) => !i.suspended && i.dir === dir);
    const cardsById = byId(await db.cards.bulkGet(candidates.map((i) => i.cardId)));
    const decksById = await decksByIdFor(cardsById);
    return candidates.filter(
      (i) => cardVisible(cardsById.get(i.cardId), decksById) && inDecks(cardsById.get(i.cardId), deckIds),
    );
  },

  /**
   * The given ids, in the same order, filtered down to items that are still
   * visible: the row exists, is not suspended, and its card and deck are
   * both still live — the same rules `due()`/`fresh()` already apply, built
   * on the same helpers so a new exclusion rule can't silently diverge
   * between them.
   *
   * This app only ever soft-deletes (`deletedAt` on Card/Deck) or suspends
   * (a flag on Item) — it has no code path that removes an Item row itself
   * — so a caller checking "does this id still resolve to a row" alone (a
   * bare `bulkGet` + drop the misses) would never actually exclude anything
   * in practice. `visible()` is what a persisted id list (a review session's
   * queue) must be re-checked against to still mean what it meant when it
   * was written down.
   */
  async visible(ids: string[]): Promise<Item[]> {
    const found = (await db.items.bulkGet(ids)).filter((i): i is Item => Boolean(i));
    const cardsById = byId(await db.cards.bulkGet(found.map((i) => i.cardId)));
    const decksById = await decksByIdFor(cardsById);
    return found.filter((i) => !i.suspended && cardVisible(cardsById.get(i.cardId), decksById));
  },

  /** One transaction for every id — a bulk suspend/un-suspend either fully lands or fully doesn't. */
  async setSuspended(ids: string[], suspended: boolean, now: number): Promise<void> {
    await db.transaction('rw', db.items, db.outbox, async () => {
      const found = (await db.items.bulkGet(ids)).filter((i): i is Item => Boolean(i));
      for (const item of found) {
        await db.items.put({ ...item, suspended, updatedAt: now });
        await db.outbox.put(outboxEntry('item', item.id, 'put', now));
      }
    });
  },
};

export interface RecordedReview {
  item: Item;
  before: SrsState;
  grade: Grade;
  reviewedAt: number;
  durationMs: number;
  /** How the answer was judged; self-graded when absent. */
  detail?: AttemptDetail;
  /** Where it was given: endless practice schedules a new card's first answer too. */
  source?: AttemptSource;
}

export const reviews = {
  async record({ item, before, grade, reviewedAt, durationMs, detail = SELF_GRADED, source = 'scheduled' }: RecordedReview): Promise<string> {
    const reviewId = uid();
    await db.transaction('rw', db.items, db.reviews, db.cards, db.attempts, db.outbox, async () => {
      // The caller's `before` is typed as `SrsState`, which has no
      // `updatedAt`, and a caller may legally pass a bare SrsState (not a
      // previously-fetched Item) — so it is never a trustworthy source for
      // the item's real prior `updatedAt`. The item's row, read here before
      // this write touches it, is the true previous state and is what gets
      // persisted. If the row is somehow absent (the item was deleted
      // concurrently), fall back to the incoming `item.updatedAt`.
      const priorItem = await db.items.get(item.id);
      const review: Review = {
        id: reviewId,
        itemId: item.id,
        grade,
        reviewedAt,
        durationMs,
        before: { ...before, updatedAt: priorItem?.updatedAt ?? item.updatedAt },
      };
      await db.items.put({ ...item, updatedAt: reviewedAt });
      await db.reviews.put(review);
      await db.outbox.put(outboxEntry('item', item.id, 'put', reviewedAt));
      await db.outbox.put(outboxEntry('review', reviewId, 'put', reviewedAt));

      const card = await db.cards.get(item.cardId);
      await db.attempts.put(
        buildAttempt({ id: reviewId, item, deckId: card?.deckId ?? '', source, grade, at: reviewedAt, durationMs, detail }),
      );
      await db.outbox.put(outboxEntry('attempt', reviewId, 'put', reviewedAt));
    });
    return reviewId;
  },

  /**
   * Undo is exact: the previous scheduling state, including the item's real
   * prior `updatedAt`, was captured in the review row by `record()`, so
   * restoring it is a copy rather than a recalculation or a heuristic.
   *
   * Sync hazard, for phase 5: the restored item carries the *older*
   * `updatedAt` from `review.before`, while its outbox entry is stamped
   * `Date.now()`. Spec §10 resolves conflicts last-write-wins on
   * `updatedAt`, so pushed as a plain put the undo would lose to the
   * server's copy of the graded state it is reverting — and a later pull
   * would bring that graded state straight back. `SyncEngine.push` must
   * treat an undo as a compensating operation rather than an ordinary
   * record write.
   */
  async undo(reviewId: string): Promise<void> {
    await db.transaction('rw', db.items, db.reviews, db.attempts, db.outbox, async () => {
      const review = await db.reviews.get(reviewId);
      if (!review) return;
      const item = await db.items.get(review.itemId);
      if (item) {
        await db.items.put({ ...item, ...review.before });
        await db.outbox.put(outboxEntry('item', item.id, 'put', Date.now()));
      }
      await db.reviews.delete(reviewId);
      await db.outbox.put(outboxEntry('review', reviewId, 'delete', Date.now()));
      await db.attempts.delete(reviewId);
      await db.outbox.put(outboxEntry('attempt', reviewId, 'delete', Date.now()));
    });
  },

  forItem: (itemIdValue: string) => db.reviews.where('itemId').equals(itemIdValue).sortBy('reviewedAt'),

  /** Every review across all of a card's items (both directions), oldest first. */
  async historyForCard(cardId: string): Promise<Review[]> {
    const cardItems = await db.items.where('cardId').equals(cardId).toArray();
    const perItem = await Promise.all(cardItems.map((item) => db.reviews.where('itemId').equals(item.id).toArray()));
    return perItem.flat().sort((a, b) => a.reviewedAt - b.reviewedAt);
  },
};

export interface LoggedAttempt {
  item: Item;
  grade: Grade;
  at: number;
  durationMs: number;
  detail: AttemptDetail;
}

export const attempts = {
  /** A practice answer: logged for the journal and statistics, never scheduled, never undone. */
  async log({ item, grade, at, durationMs, detail }: LoggedAttempt): Promise<string> {
    const id = uid();
    await db.transaction('rw', db.cards, db.attempts, db.outbox, async () => {
      const card = await db.cards.get(item.cardId);
      await db.attempts.put(buildAttempt({ id, item, deckId: card?.deckId ?? '', source: 'practice', grade, at, durationMs, detail }));
      await db.outbox.put(outboxEntry('attempt', id, 'put', at));
    });
    return id;
  },

  /** Every answer on a card, both directions and both sources, oldest first. */
  forCard: (cardId: string): Promise<Attempt[]> => db.attempts.where('cardId').equals(cardId).sortBy('at'),
};

export const stats = {
  /**
   * Everything the Statistics page aggregates, read once when it opens.
   * The aggregates themselves are pure (`core/stats`); this is the one place
   * that reads the tables for them, through `useStats`.
   */
  async snapshot(): Promise<StatsSnapshot> {
    const [attemptRows, reviewRows, itemRows, cardRows, deckRows] = await Promise.all([
      db.attempts.toArray(),
      db.reviews.toArray(),
      db.items.toArray(),
      db.cards.toArray(),
      db.decks.toArray(),
    ]);
    const bundle = activeBundle();
    if (bundle === null) return { attempts: attemptRows, reviews: reviewRows, items: itemRows, cards: cardRows, decks: deckRows };
    // Every deck of the other bundle is left out, deleted or not: a deleted
    // deck keeps its cards, and their characters are in the other script.
    // Negative sets, so a row whose parent is missing passes through.
    const hidden = new Set(deckRows.filter((d) => d.bundle !== bundle).map((d) => d.id));
    const cards = cardRows.filter((c) => !hidden.has(c.deckId));
    const droppedCards = new Set(cardRows.filter((c) => hidden.has(c.deckId)).map((c) => c.id));
    const items = itemRows.filter((i) => !droppedCards.has(i.cardId));
    const droppedItems = new Set(itemRows.filter((i) => droppedCards.has(i.cardId)).map((i) => i.id));
    return {
      attempts: attemptRows.filter((a) => !hidden.has(a.deckId)),
      reviews: reviewRows.filter((r) => !droppedItems.has(r.itemId)),
      items,
      cards,
      decks: deckRows.filter((d) => !hidden.has(d.id)),
    };
  },
};
