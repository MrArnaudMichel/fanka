-- `Attempt` (core/db/schema.ts): one row per answer, from a scheduled session
-- or endless practice. Append-only and insert-only for the owner, exactly
-- like `reviews` (see 0001): no update or delete policy, so a local undo of
-- an attempt already pushed here is not propagated — the same accepted gap
-- as for reviews. `writing` holds the per-character verdicts whole, as jsonb;
-- nothing queries into it.
create table if not exists public.attempts (
  id text not null,
  user_id uuid not null references auth.users (id) on delete cascade,
  item_id text not null,
  card_id text not null,
  deck_id text not null,
  mode text not null check (mode in ('review', 'writing')),
  source text not null check (source in ('scheduled', 'practice')),
  grade smallint not null check (grade between 1 and 4),
  correct boolean not null,
  at bigint not null,
  duration_ms integer not null,
  checked boolean not null,
  writing jsonb,
  primary key (user_id, id)
);

create index if not exists attempts_user_id_at_idx on public.attempts (user_id, at);

alter table public.attempts enable row level security;

create policy "attempts_select_own" on public.attempts for select using (auth.uid() = user_id);
create policy "attempts_insert_own" on public.attempts for insert with check (auth.uid() = user_id);
-- Deliberately no update or delete policy — see the note above the table.
