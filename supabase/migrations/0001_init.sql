-- Threads Analytics schema + Row Level Security
-- Run in Supabase Dashboard -> SQL Editor (or `supabase db push`).

create extension if not exists "pgcrypto";

-- 1) User data -------------------------------------------------------------
create table if not exists public.profiles (
  id uuid primary key references auth.users (id) on delete cascade,
  email text,
  created_at timestamptz not null default now()
);

-- auto-create a profile row on signup
create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer set search_path = public
as $$
begin
  insert into public.profiles (id, email) values (new.id, new.email)
  on conflict (id) do nothing;
  return new;
end;
$$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();

-- 2) Analysis tasks --------------------------------------------------------
create table if not exists public.analysis_tasks (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade default auth.uid(),
  username text not null,
  source text not null check (source in ('mock', 'api')),
  status text not null default 'pending' check (status in ('pending', 'running', 'done', 'failed')),
  error text,
  post_count int not null default 0,
  created_at timestamptz not null default now(),
  finished_at timestamptz
);
create index if not exists analysis_tasks_user_idx on public.analysis_tasks (user_id, created_at desc);
create index if not exists analysis_tasks_cache_idx on public.analysis_tasks (user_id, username, source, created_at desc);

-- 3) Post data -------------------------------------------------------------
create table if not exists public.posts (
  id uuid primary key default gen_random_uuid(),
  task_id uuid not null references public.analysis_tasks (id) on delete cascade,
  user_id uuid not null references auth.users (id) on delete cascade default auth.uid(),
  external_id text not null,
  post_url text not null,
  posted_at timestamptz not null,
  text text not null default '',
  likes int not null default 0,
  replies int not null default 0,
  reposts int not null default 0,
  quotes int not null default 0,
  word_count int not null default 0,
  char_count int not null default 0,
  hashtag_count int not null default 0,
  mention_count int not null default 0,
  url_count int not null default 0,
  post_type text not null default 'plain',
  engagement int not null default 0,
  engagement_rate numeric not null default 0,
  perf_group text not null default 'mid' check (perf_group in ('high', 'mid', 'low')),
  unique (task_id, external_id)
);
create index if not exists posts_task_idx on public.posts (task_id);
create index if not exists posts_user_idx on public.posts (user_id);

-- 4) Summary analysis results ---------------------------------------------
create table if not exists public.analysis_summaries (
  id uuid primary key default gen_random_uuid(),
  task_id uuid not null unique references public.analysis_tasks (id) on delete cascade,
  user_id uuid not null references auth.users (id) on delete cascade default auth.uid(),
  summary jsonb not null,
  created_at timestamptz not null default now()
);
create index if not exists analysis_summaries_user_idx on public.analysis_summaries (user_id);

-- 5) Row Level Security ----------------------------------------------------
alter table public.profiles enable row level security;
alter table public.analysis_tasks enable row level security;
alter table public.posts enable row level security;
alter table public.analysis_summaries enable row level security;

-- profiles: a user can only see / edit their own row
drop policy if exists "profiles_select_own" on public.profiles;
create policy "profiles_select_own" on public.profiles
  for select using (auth.uid() = id);
drop policy if exists "profiles_update_own" on public.profiles;
create policy "profiles_update_own" on public.profiles
  for update using (auth.uid() = id) with check (auth.uid() = id);

-- analysis_tasks / posts / analysis_summaries: full CRUD on own rows only
drop policy if exists "tasks_own_all" on public.analysis_tasks;
create policy "tasks_own_all" on public.analysis_tasks
  for all using (auth.uid() = user_id) with check (auth.uid() = user_id);

drop policy if exists "posts_own_all" on public.posts;
create policy "posts_own_all" on public.posts
  for all using (auth.uid() = user_id) with check (auth.uid() = user_id);

drop policy if exists "summaries_own_all" on public.analysis_summaries;
create policy "summaries_own_all" on public.analysis_summaries
  for all using (auth.uid() = user_id) with check (auth.uid() = user_id);
