-- Shared intelligence snapshots — back the /share/[id] public link.
-- Anyone with the id can read; only the creator can insert or delete.

create table if not exists public.snapshots (
  id          text          primary key,
  user_id     uuid          references auth.users(id) on delete set null,
  title       text          not null default 'ARGUS Intelligence Snapshot',
  description text          not null default '',
  state       jsonb         not null,
  created_at  timestamptz   not null default now()
);

create index if not exists snapshots_user_created_idx on public.snapshots (user_id, created_at desc);

alter table public.snapshots enable row level security;

-- Public read by id — share links are designed to be opened by anyone.
drop policy if exists "snapshots_public_read" on public.snapshots;
create policy "snapshots_public_read"
  on public.snapshots for select
  using (true);

-- Only authenticated users can create; user_id must match the caller.
drop policy if exists "snapshots_owner_insert" on public.snapshots;
create policy "snapshots_owner_insert"
  on public.snapshots for insert
  with check (auth.uid() = user_id);

-- Only the owner can delete.
drop policy if exists "snapshots_owner_delete" on public.snapshots;
create policy "snapshots_owner_delete"
  on public.snapshots for delete
  using (auth.uid() = user_id);
