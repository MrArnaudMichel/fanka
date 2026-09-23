import type { SupabaseClient } from '@supabase/supabase-js';

import type { Card, Deck, Direction, Item, PartOfSpeech, Review } from '~core/db/schema';
import type { ItemState } from '~core/srs';
import type { LocalChanges, RemoteChanges, SyncTransport } from './types';

/**
 * The one file in `core/sync` allowed to import `@supabase/supabase-js`.
 * Everything else in `core/sync` talks to `SyncTransport` only, so a test
 * never needs a real Supabase project — see `test/sync/engine.test.ts`'s
 * `FakeTransport`.
 *
 * Column names are snake_case (`supabase/migrations/0001_init.sql`); the
 * `*FromRow`/`*ToRow` pairs below are the one place that maps them to/from
 * the camelCase shapes in `core/db/schema.ts`. Every row read back from
 * Postgres is trusted as already matching its CHECK constraint (e.g.
 * `pos in (...)`) rather than re-validated here — the database is the
 * enforcement point, this is just a reshape.
 */

interface DeckRow {
  id: string;
  user_id: string;
  name: string;
  description: string;
  color_token: string;
  tag: string;
  translation_lang: string;
  created_at: number;
  updated_at: number;
  deleted_at: number | null;
}

function deckFromRow(row: DeckRow): Deck {
  return {
    id: row.id,
    name: row.name,
    description: row.description,
    colorToken: row.color_token,
    tag: row.tag,
    translationLang: row.translation_lang,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
    deletedAt: row.deleted_at,
  };
}

function deckToRow(deck: Deck, userId: string): DeckRow {
  return {
    id: deck.id,
    user_id: userId,
    name: deck.name,
    description: deck.description,
    color_token: deck.colorToken,
    tag: deck.tag,
    translation_lang: deck.translationLang,
    created_at: deck.createdAt,
    updated_at: deck.updatedAt,
    deleted_at: deck.deletedAt,
  };
}

interface CardRow {
  id: string;
  user_id: string;
  deck_id: string;
  hanzi: string;
  pinyin: Card['pinyin'];
  zhuyin: string;
  translation: string;
  pos: string;
  example: string;
  example_pinyin: string;
  example_translation: string;
  tags: string[];
  note: string;
  created_at: number;
  updated_at: number;
  deleted_at: number | null;
}

function cardFromRow(row: CardRow): Card {
  return {
    id: row.id,
    deckId: row.deck_id,
    hanzi: row.hanzi,
    pinyin: row.pinyin,
    zhuyin: row.zhuyin,
    translation: row.translation,
    pos: row.pos as PartOfSpeech,
    example: row.example,
    examplePinyin: row.example_pinyin,
    exampleTranslation: row.example_translation,
    tags: row.tags,
    note: row.note,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
    deletedAt: row.deleted_at,
  };
}

function cardToRow(card: Card, userId: string): CardRow {
  return {
    id: card.id,
    user_id: userId,
    deck_id: card.deckId,
    hanzi: card.hanzi,
    pinyin: card.pinyin,
    zhuyin: card.zhuyin,
    translation: card.translation,
    pos: card.pos,
    example: card.example,
    example_pinyin: card.examplePinyin,
    example_translation: card.exampleTranslation,
    tags: card.tags,
    note: card.note,
    created_at: card.createdAt,
    updated_at: card.updatedAt,
    deleted_at: card.deletedAt,
  };
}

interface ItemRow {
  id: string;
  user_id: string;
  card_id: string;
  dir: string;
  suspended: boolean;
  state: string;
  due: number;
  stability: number;
  difficulty: number;
  elapsed_days: number;
  scheduled_days: number;
  reps: number;
  lapses: number;
  learning_steps: number;
  last_review: number | null;
  updated_at: number;
}

function itemFromRow(row: ItemRow): Item {
  return {
    id: row.id,
    cardId: row.card_id,
    dir: row.dir as Direction,
    suspended: row.suspended,
    state: row.state as ItemState,
    due: row.due,
    stability: row.stability,
    difficulty: row.difficulty,
    elapsedDays: row.elapsed_days,
    scheduledDays: row.scheduled_days,
    reps: row.reps,
    lapses: row.lapses,
    learningSteps: row.learning_steps,
    lastReview: row.last_review,
    updatedAt: row.updated_at,
  };
}

function itemToRow(item: Item, userId: string): ItemRow {
  return {
    id: item.id,
    user_id: userId,
    card_id: item.cardId,
    dir: item.dir,
    suspended: item.suspended,
    state: item.state,
    due: item.due,
    stability: item.stability,
    difficulty: item.difficulty,
    elapsed_days: item.elapsedDays,
    scheduled_days: item.scheduledDays,
    reps: item.reps,
    lapses: item.lapses,
    learning_steps: item.learningSteps,
    last_review: item.lastReview,
    updated_at: item.updatedAt,
  };
}

interface ReviewRow {
  id: string;
  user_id: string;
  item_id: string;
  grade: number;
  reviewed_at: number;
  duration_ms: number;
  before: Review['before'];
}

function reviewFromRow(row: ReviewRow): Review {
  return {
    id: row.id,
    itemId: row.item_id,
    grade: row.grade as Review['grade'],
    reviewedAt: row.reviewed_at,
    durationMs: row.duration_ms,
    before: row.before,
  };
}

function reviewToRow(review: Review, userId: string): ReviewRow {
  return {
    id: review.id,
    user_id: userId,
    item_id: review.itemId,
    grade: review.grade,
    reviewed_at: review.reviewedAt,
    duration_ms: review.durationMs,
    before: review.before,
  };
}

/**
 * The `at` a pull returns is the max `updated_at`/`reviewed_at` among the
 * rows it actually fetched, not a true server clock reading (that would
 * need an RPC call this prototype doesn't add). Two writes landing in the
 * same millisecond, one just past the query's cutoff, is a known,
 * accepted rough edge — see the step-4 report.
 */
function maxAt(since: number, values: number[]): number {
  return values.reduce((max, value) => Math.max(max, value), since);
}

/**
 * The `SyncTransport` implementation over a real Supabase project. `userId`
 * is the signed-in user's id (`auth.uid()`, matched by every RLS policy in
 * the migration) — this module does no authentication itself; whatever
 * calls `createSupabaseTransport` is responsible for having a signed-in
 * `SupabaseClient` already.
 */
export function createSupabaseTransport(client: SupabaseClient, userId: string): SyncTransport {
  return {
    async pull(since: number): Promise<RemoteChanges> {
      const [decksRes, cardsRes, itemsRes, reviewsRes] = await Promise.all([
        client.from('decks').select('*').eq('user_id', userId).gt('updated_at', since),
        client.from('cards').select('*').eq('user_id', userId).gt('updated_at', since),
        client.from('items').select('*').eq('user_id', userId).gt('updated_at', since),
        client.from('reviews').select('*').eq('user_id', userId).gt('reviewed_at', since),
      ]);
      if (decksRes.error) throw decksRes.error;
      if (cardsRes.error) throw cardsRes.error;
      if (itemsRes.error) throw itemsRes.error;
      if (reviewsRes.error) throw reviewsRes.error;

      const decks = ((decksRes.data ?? []) as DeckRow[]).map(deckFromRow);
      const cards = ((cardsRes.data ?? []) as CardRow[]).map(cardFromRow);
      const items = ((itemsRes.data ?? []) as ItemRow[]).map(itemFromRow);
      const reviews = ((reviewsRes.data ?? []) as ReviewRow[]).map(reviewFromRow);

      const at = maxAt(since, [
        ...decks.map((d) => d.updatedAt),
        ...cards.map((c) => c.updatedAt),
        ...items.map((i) => i.updatedAt),
        ...reviews.map((r) => r.reviewedAt),
      ]);

      return { decks, cards, items, reviews, at };
    },

    async push(changes: LocalChanges): Promise<{ at: number }> {
      if (changes.decks.length > 0) {
        const { error } = await client
          .from('decks')
          .upsert(
            changes.decks.map((d) => deckToRow(d, userId)),
            { onConflict: 'user_id,id' },
          );
        if (error) throw error;
      }
      if (changes.cards.length > 0) {
        const { error } = await client
          .from('cards')
          .upsert(
            changes.cards.map((c) => cardToRow(c, userId)),
            { onConflict: 'user_id,id' },
          );
        if (error) throw error;
      }
      if (changes.items.length > 0) {
        const { error } = await client
          .from('items')
          .upsert(
            changes.items.map((i) => itemToRow(i, userId)),
            { onConflict: 'user_id,id' },
          );
        if (error) throw error;
      }
      if (changes.reviews.length > 0) {
        // Insert-only, per the migration's RLS (no update policy on
        // reviews): `ignoreDuplicates` turns a retry of an already-landed
        // review into `ON CONFLICT DO NOTHING` instead of an error, so a
        // push that partially succeeded before failing can be safely
        // retried whole.
        const { error } = await client
          .from('reviews')
          .upsert(
            changes.reviews.map((r) => reviewToRow(r, userId)),
            { onConflict: 'user_id,id', ignoreDuplicates: true },
          );
        if (error) throw error;
      }
      return { at: Date.now() };
    },
  };
}
