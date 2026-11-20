-- `LessonProgress` (core/db/schema.ts): one row per finished lesson or unit
-- writing session, or per lesson marked known at onboarding. Unlike attempts
-- it is updated in place (a repeated lesson replaces its row), so the owner
-- gets an update policy too; there is still no delete.
create table if not exists public.lesson_progress (
  id text not null,
  user_id uuid not null references auth.users (id) on delete cascade,
  bundle text not null check (bundle in ('mainland', 'taiwan')),
  kind text not null check (kind in ('lesson', 'writing')),
  completed_at bigint not null,
  right_count integer not null,
  total integer not null,
  known boolean not null,
  updated_at bigint not null,
  primary key (user_id, id)
);

create index if not exists lesson_progress_user_id_updated_at_idx on public.lesson_progress (user_id, updated_at);

alter table public.lesson_progress enable row level security;

create policy "lesson_progress_select_own" on public.lesson_progress for select using (auth.uid() = user_id);
create policy "lesson_progress_insert_own" on public.lesson_progress for insert with check (auth.uid() = user_id);
create policy "lesson_progress_update_own" on public.lesson_progress for update using (auth.uid() = user_id) with check (auth.uid() = user_id);

-- Answers given in a lesson are attempts with source 'lesson'.
-- The check was declared inline in 0002, so Postgres named it attempts_source_check.
alter table public.attempts drop constraint if exists attempts_source_check;
alter table public.attempts add constraint attempts_source_check check (source in ('scheduled', 'practice', 'lesson'));
