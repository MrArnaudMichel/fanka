alter table public.decks add column bundle text not null default 'taiwan' check (bundle in ('mainland','taiwan'));
