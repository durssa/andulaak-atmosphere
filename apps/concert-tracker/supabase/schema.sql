-- Encore: run this once in the Supabase SQL editor (Project → SQL → New query).
-- Creates the three tables the app syncs and locks every row to its owner.

create table if not exists public.tracked_events (
  user_id    uuid not null references auth.users (id) on delete cascade,
  event_id   text not null,
  status     text not null check (status in ('interested', 'going', 'attended')),
  notes      text not null default '',
  rating     smallint check (rating between 0 and 5),
  event      jsonb not null,
  added_at   timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  primary key (user_id, event_id)
);

create table if not exists public.followed_artists (
  user_id     uuid not null references auth.users (id) on delete cascade,
  name_key    text not null,
  name        text not null,
  image       text,
  spotify_url text,
  added_at    timestamptz not null default now(),
  updated_at  timestamptz not null default now(),
  primary key (user_id, name_key)
);

create table if not exists public.user_settings (
  user_id    uuid primary key references auth.users (id) on delete cascade,
  data       jsonb not null default '{}'::jsonb,
  updated_at timestamptz not null default now()
);

alter table public.tracked_events   enable row level security;
alter table public.followed_artists enable row level security;
alter table public.user_settings    enable row level security;

drop policy if exists "own rows" on public.tracked_events;
create policy "own rows" on public.tracked_events
  for all using (auth.uid() = user_id) with check (auth.uid() = user_id);

drop policy if exists "own rows" on public.followed_artists;
create policy "own rows" on public.followed_artists
  for all using (auth.uid() = user_id) with check (auth.uid() = user_id);

drop policy if exists "own rows" on public.user_settings;
create policy "own rows" on public.user_settings
  for all using (auth.uid() = user_id) with check (auth.uid() = user_id);

create index if not exists tracked_events_user_updated on public.tracked_events (user_id, updated_at desc);
