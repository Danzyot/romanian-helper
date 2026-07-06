-- Supabase schema for per-user progress sync.
-- Run in the Supabase SQL editor after creating the project.
-- Idempotent: safe to run multiple times.
-- The app works local-first; these tables mirror src/lib/progress.ts state.

create table if not exists public.word_stats (
  user_id    uuid not null references auth.users (id) on delete cascade,
  word_id    text not null,
  box        smallint not null default 0,
  due        timestamptz,
  seen       integer not null default 0,
  correct    integer not null default 0,
  wrong      integer not null default 0,
  last_score smallint,
  updated_at timestamptz not null default now(),
  primary key (user_id, word_id)
);

create table if not exists public.activity_days (
  user_id uuid not null references auth.users (id) on delete cascade,
  day     date not null,
  primary key (user_id, day)
);

alter table public.word_stats enable row level security;
alter table public.activity_days enable row level security;

drop policy if exists "own word_stats" on public.word_stats;
create policy "own word_stats" on public.word_stats
  for all using (auth.uid() = user_id) with check (auth.uid() = user_id);

drop policy if exists "own activity_days" on public.activity_days;
create policy "own activity_days" on public.activity_days
  for all using (auth.uid() = user_id) with check (auth.uid() = user_id);
