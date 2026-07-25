-- Intelligence history: briefs + NLQ answers (cloud sync)
-- Run in Supabase SQL editor after schema.sql

create table if not exists public.intel_briefs (
  id           uuid          primary key default gen_random_uuid(),
  user_id      uuid          not null references auth.users(id) on delete cascade,
  type         text          not null check (type in ('country', 'project', 'canvas')),
  title        text          not null default '',
  country      text          not null default '',
  country_code text          not null default '',
  project_id   text,
  data         jsonb         not null,
  summary      text          not null default '',
  created_at   timestamptz   not null default now()
);

create table if not exists public.nlq_history (
  id              uuid          primary key default gen_random_uuid(),
  user_id         uuid          not null references auth.users(id) on delete cascade,
  project_id      text,
  query           text          not null,
  summary         text          not null default '',
  applied_filters text          not null default '',
  match_count     integer       not null default 0,
  created_at      timestamptz   not null default now()
);

create index if not exists intel_briefs_user_created_idx on public.intel_briefs (user_id, created_at desc);
create index if not exists intel_briefs_project_idx      on public.intel_briefs (project_id);
create index if not exists nlq_history_user_created_idx    on public.nlq_history (user_id, created_at desc);
create index if not exists nlq_history_project_idx         on public.nlq_history (project_id);

alter table public.intel_briefs enable row level security;
alter table public.nlq_history   enable row level security;

drop policy if exists "users_own_intel_briefs" on public.intel_briefs;
create policy "users_own_intel_briefs"
  on public.intel_briefs for all
  using  (auth.uid() = user_id)
  with check (auth.uid() = user_id);

drop policy if exists "users_own_nlq_history" on public.nlq_history;
create policy "users_own_nlq_history"
  on public.nlq_history for all
  using  (auth.uid() = user_id)
  with check (auth.uid() = user_id);
