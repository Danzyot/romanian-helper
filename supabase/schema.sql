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

-- Ana's long-term memory: personal facts the tutor learns in conversation.
create table if not exists public.tutor_memory (
  user_id    uuid primary key references auth.users (id) on delete cascade,
  facts      jsonb not null default '[]',
  updated_at timestamptz not null default now()
);

alter table public.tutor_memory enable row level security;

drop policy if exists "own tutor_memory" on public.tutor_memory;
create policy "own tutor_memory" on public.tutor_memory
  for all using (auth.uid() = user_id) with check (auth.uid() = user_id);

-- Usage + feedback: what gets used, and the little "was this helpful?" answers.
create table if not exists public.usage_events (
  id      bigint generated always as identity primary key,
  user_id uuid not null references auth.users (id) on delete cascade,
  ts      timestamptz not null default now(),
  kind    text not null,
  detail  jsonb not null default '{}'
);

create index if not exists usage_events_user_ts
  on public.usage_events (user_id, ts desc);

alter table public.usage_events enable row level security;

drop policy if exists "own usage_events" on public.usage_events;
create policy "own usage_events" on public.usage_events
  for all using (auth.uid() = user_id) with check (auth.uid() = user_id);

-- App-wide settings (e.g. which AI models to use). Any signed-in user of the
-- app can read and change them; the tutor function reads them on each call.
create table if not exists public.app_config (
  key        text primary key,
  value      text not null,
  updated_at timestamptz not null default now()
);

alter table public.app_config enable row level security;

drop policy if exists "signed-in read config" on public.app_config;
drop policy if exists "admins write config" on public.app_config;
drop policy if exists "signed-in manage config" on public.app_config;
create policy "signed-in manage config" on public.app_config
  for all to authenticated using (true) with check (true);
