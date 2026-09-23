-- Fanka sync schema.
--
-- Every id below is the app's own string id (a `crypto.randomUUID()`, or,
-- for an Item, `${cardId}:${dir}` — see `core/db/schema.ts::itemId`) rather
-- than a Postgres-generated one, so every id column is `text`, never `uuid`.
--
-- Primary keys are `(user_id, id)` rather than `id` alone: it keeps one
-- user's id space fully independent of another's, so a collision between
-- two different learners' client-generated ids (already astronomically
-- unlikely, since ids are UUIDs — except Item's, which are only unique
-- within one card) can never cross accounts, and RLS's per-row ownership
-- check lines up exactly with what the primary key already enforces.
--
-- Columns are snake_case; `core/sync/supabase.ts` is the one place that maps
-- them to/from the camelCase TypeScript shapes in `core/db/schema.ts`.
--
-- `updated_at`/`deleted_at` are the app's own epoch-millisecond clock
-- (`Date.now()`), stored as `bigint`, not Postgres `timestamptz` — the sync
-- engine's last-write-wins compares these against the same field on the
-- local Dexie row, so the two must be the exact same number, not a
-- reformatted or timezone-shifted copy of it.
--
-- `Item` and `Review` (`core/db/schema.ts`) do not mirror `updated_at`/
-- `deleted_at` 1:1 — see the notes on each table below for why.

create table if not exists public.decks (
  id text not null,
  user_id uuid not null references auth.users (id) on delete cascade,
  name text not null,
  description text not null,
  color_token text not null,
  tag text not null,
  translation_lang text not null,
  created_at bigint not null,
  updated_at bigint not null,
  deleted_at bigint,
  primary key (user_id, id)
);

create index if not exists decks_user_id_updated_at_idx on public.decks (user_id, updated_at);

alter table public.decks enable row level security;

create policy "decks_select_own" on public.decks for select using (auth.uid() = user_id);
create policy "decks_insert_own" on public.decks for insert with check (auth.uid() = user_id);
create policy "decks_update_own" on public.decks for update using (auth.uid() = user_id) with check (auth.uid() = user_id);
-- No delete policy: the app only ever soft-deletes (an update that sets
-- deleted_at), matching core/db/repositories.ts's decks.softDelete. With RLS
-- enabled and no delete policy, a DELETE is simply denied.

create table if not exists public.cards (
  id text not null,
  user_id uuid not null references auth.users (id) on delete cascade,
  deck_id text not null,
  hanzi text not null,
  -- PinyinSyllable[] (`core/chinese/pinyin.ts`), stored whole: it is always
  -- read and written as one unit, never queried by a single syllable's
  -- fields, so a jsonb column costs nothing beyond a normalized form here.
  pinyin jsonb not null,
  zhuyin text not null,
  translation text not null,
  pos text not null check (pos in ('noun', 'verb', 'adjective', 'adverb', 'phrase')),
  example text not null,
  example_pinyin text not null,
  example_translation text not null,
  tags text[] not null default '{}',
  note text not null,
  created_at bigint not null,
  updated_at bigint not null,
  deleted_at bigint,
  primary key (user_id, id)
);

create index if not exists cards_user_id_updated_at_idx on public.cards (user_id, updated_at);

alter table public.cards enable row level security;

create policy "cards_select_own" on public.cards for select using (auth.uid() = user_id);
create policy "cards_insert_own" on public.cards for insert with check (auth.uid() = user_id);
create policy "cards_update_own" on public.cards for update using (auth.uid() = user_id) with check (auth.uid() = user_id);

-- `Item` (core/db/schema.ts) has no `deletedAt` — an item is never deleted,
-- only suspended (a flag) or hidden through its card's/deck's own
-- deleted_at — so there is no deleted_at column here to mirror.
create table if not exists public.items (
  id text not null,
  user_id uuid not null references auth.users (id) on delete cascade,
  card_id text not null,
  dir text not null check (dir in ('recognition', 'production')),
  suspended boolean not null,
  -- SrsState (core/srs/types.ts):
  state text not null check (state in ('new', 'learning', 'review', 'relearning')),
  due bigint not null,
  stability double precision not null,
  difficulty double precision not null,
  elapsed_days integer not null,
  scheduled_days integer not null,
  reps integer not null,
  lapses integer not null,
  learning_steps integer not null,
  last_review bigint,
  updated_at bigint not null,
  primary key (user_id, id)
);

create index if not exists items_user_id_updated_at_idx on public.items (user_id, updated_at);

alter table public.items enable row level security;

create policy "items_select_own" on public.items for select using (auth.uid() = user_id);
create policy "items_insert_own" on public.items for insert with check (auth.uid() = user_id);
create policy "items_update_own" on public.items for update using (auth.uid() = user_id) with check (auth.uid() = user_id);

-- `Review` (core/db/schema.ts) has neither `updatedAt` nor `deletedAt` — it
-- is a single immutable event stamped with `reviewedAt`, which is what
-- `reviewed_at` (not `updated_at`) drives this table's "since" index and
-- the sync engine's pull filter for this one entity. `before` is the whole
-- `SrsState & { updatedAt: number }` snapshot the review carries, stored as
-- one jsonb column rather than flattened — nothing ever queries into it,
-- it is only ever read back or written whole (see `reviews.record`/`undo`
-- in core/db/repositories.ts).
--
-- Insert-only for the owner: no update or delete policy at all, so once a
-- review lands here it cannot be changed or removed by anyone, including
-- its own owner. A local `undo` (which hard-deletes the review row and
-- reverts the item locally — see the hazard note on `reviews.undo`) has no
-- way to propagate to a row already pushed here; that gap is accepted for
-- this prototype and documented in the step-4 report.
create table if not exists public.reviews (
  id text not null,
  user_id uuid not null references auth.users (id) on delete cascade,
  item_id text not null,
  grade smallint not null check (grade between 1 and 4),
  reviewed_at bigint not null,
  duration_ms integer not null,
  before jsonb not null,
  primary key (user_id, id)
);

create index if not exists reviews_user_id_reviewed_at_idx on public.reviews (user_id, reviewed_at);

alter table public.reviews enable row level security;

create policy "reviews_select_own" on public.reviews for select using (auth.uid() = user_id);
create policy "reviews_insert_own" on public.reviews for insert with check (auth.uid() = user_id);
-- Deliberately no update or delete policy — see the note above the table.

-- `Settings` (core/db/settings.ts) is not an entity in `OutboxEntry`
-- (core/db/schema.ts's union is `'deck' | 'card' | 'item' | 'review'`), so
-- nothing in the app records an outbox entry for a settings change today,
-- and `core/sync`'s engine never reads or writes this table. It is created
-- here only so a later phase can wire settings sync in without a further
-- migration; until then this table stays empty. `user_id` is the primary
-- key rather than an app-issued id, since Settings has no id of its own —
-- one row per user, keyed by the user itself.
create table if not exists public.settings (
  user_id uuid not null references auth.users (id) on delete cascade primary key,
  -- The whole `Settings` object (core/db/settings.ts), exactly as stored
  -- locally in Dexie's `settings` table under the `'settings'` key.
  value jsonb not null,
  updated_at bigint not null,
  deleted_at bigint
);

create index if not exists settings_user_id_updated_at_idx on public.settings (user_id, updated_at);

alter table public.settings enable row level security;

create policy "settings_select_own" on public.settings for select using (auth.uid() = user_id);
create policy "settings_insert_own" on public.settings for insert with check (auth.uid() = user_id);
create policy "settings_update_own" on public.settings for update using (auth.uid() = user_id) with check (auth.uid() = user_id);
