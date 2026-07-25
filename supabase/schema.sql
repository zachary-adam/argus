-- Run this in Supabase Dashboard → SQL Editor

-- Projects table: one row per ARGUS project per user
create table if not exists public.projects (
  id          text        primary key,          -- matches Project.id (uuid)
  user_id     uuid        not null references auth.users(id) on delete cascade,
  data        jsonb       not null,             -- full Project object (byokApiKey stripped)
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);

-- Index for fast per-user queries
create index if not exists projects_user_id_idx on public.projects(user_id);

-- Updated_at auto-bump trigger
create or replace function public.set_updated_at()
returns trigger language plpgsql as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

drop trigger if exists projects_set_updated_at on public.projects;
create trigger projects_set_updated_at
  before update on public.projects
  for each row execute function public.set_updated_at();

-- Row Level Security: users can only read/write their own projects
alter table public.projects enable row level security;

drop policy if exists "users_own_projects" on public.projects;
create policy "users_own_projects"
  on public.projects
  for all
  using  (auth.uid() = user_id)
  with check (auth.uid() = user_id);

-- Intelligence history (briefs + NLQ) — run migration 20260622_intel_history.sql for full DDL

-- Research journal (curated library, hypothesis trail, event↔paper links)
-- Run migration 20260701_research_journal.sql for journal_entries,
-- hypothesis_revisions, and event_paper_links tables.
