-- Research journal — curated library, hypothesis trail, event↔paper links.
-- Stored per project (cloud sync); local-only installs keep data in projects.data JSON.

create table if not exists public.journal_entries (
  id            text          primary key,
  project_id    text          not null references public.projects(id) on delete cascade,
  user_id       uuid          not null references auth.users(id) on delete cascade,
  kind          text          not null check (kind in ('event', 'paper', 'note')),
  significance  text          check (significance is null or significance in ('key', 'supporting', 'background')),
  event_id      text,
  saved_at      timestamptz   not null,
  updated_at    timestamptz   not null,
  data          jsonb         not null
);

create index if not exists journal_entries_project_saved_idx
  on public.journal_entries (project_id, saved_at desc);

create index if not exists journal_entries_user_project_idx
  on public.journal_entries (user_id, project_id);

create index if not exists journal_entries_event_idx
  on public.journal_entries (project_id, event_id)
  where event_id is not null;

create table if not exists public.hypothesis_revisions (
  id            text          primary key,
  project_id    text          not null references public.projects(id) on delete cascade,
  user_id       uuid          not null references auth.users(id) on delete cascade,
  recorded_at   timestamptz   not null,
  data          jsonb         not null
);

create index if not exists hypothesis_revisions_project_idx
  on public.hypothesis_revisions (project_id, recorded_at desc);

create index if not exists hypothesis_revisions_user_project_idx
  on public.hypothesis_revisions (user_id, project_id);

create table if not exists public.event_paper_links (
  id              text          primary key,
  project_id      text          not null references public.projects(id) on delete cascade,
  user_id         uuid          not null references auth.users(id) on delete cascade,
  event_id        text          not null,
  paper_entry_id  text          not null,
  data            jsonb         not null
);

create index if not exists event_paper_links_project_idx
  on public.event_paper_links (project_id);

create index if not exists event_paper_links_event_idx
  on public.event_paper_links (project_id, event_id);

create index if not exists event_paper_links_paper_idx
  on public.event_paper_links (project_id, paper_entry_id);

-- RLS
alter table public.journal_entries enable row level security;
alter table public.hypothesis_revisions enable row level security;
alter table public.event_paper_links enable row level security;

drop policy if exists "users_own_journal_entries" on public.journal_entries;
create policy "users_own_journal_entries"
  on public.journal_entries for all
  using  (auth.uid() = user_id)
  with check (auth.uid() = user_id);

drop policy if exists "users_own_hypothesis_revisions" on public.hypothesis_revisions;
create policy "users_own_hypothesis_revisions"
  on public.hypothesis_revisions for all
  using  (auth.uid() = user_id)
  with check (auth.uid() = user_id);

drop policy if exists "users_own_event_paper_links" on public.event_paper_links;
create policy "users_own_event_paper_links"
  on public.event_paper_links for all
  using  (auth.uid() = user_id)
  with check (auth.uid() = user_id);
