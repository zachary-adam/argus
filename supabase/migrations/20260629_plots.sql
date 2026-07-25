-- Analyst plots — points, zones, polygons drawn on the map.
-- User-scoped (no workspace concept in cloud). The local SQLite schema keeps
-- the workspace_id column for self-host backwards compat — cloud rows use
-- user_id as the only owner.

create table if not exists public.plots (
  id           text          primary key,
  user_id      uuid          not null references auth.users(id) on delete cascade,
  type         text          not null check (type in ('point', 'zone', 'polygon')),
  coordinates  jsonb         not null,
  label        text          not null default '',
  properties   jsonb         not null default '{}'::jsonb,
  created_at   timestamptz   not null default now()
);

create index if not exists plots_user_created_idx on public.plots (user_id, created_at desc);

alter table public.plots enable row level security;

drop policy if exists "users_own_plots" on public.plots;
create policy "users_own_plots"
  on public.plots for all
  using  (auth.uid() = user_id)
  with check (auth.uid() = user_id);
