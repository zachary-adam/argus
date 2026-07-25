/**
 * Server-side snapshot store — SQLite locally, Supabase in cloud mode.
 * Snapshots back the /share/[id] public link, so reads are anonymous-allowed
 * but writes require an authenticated user.
 */
import {
  snapshotInsert as sqliteInsert,
  snapshotGet as sqliteGet,
  snapshotDelete as sqliteDelete,
  rand,
  type DbSnapshot,
} from '@/lib/db'
import { IS_CLOUD_MODE as IS_CLOUD } from '@/lib/supabase/config'

export type { DbSnapshot }

async function supabase() {
  const { createClient } = await import('@/lib/supabase/server')
  return createClient()
}

function mapRow(row: Record<string, unknown>): DbSnapshot {
  return {
    id: String(row.id),
    title: String(row.title ?? ''),
    description: String(row.description ?? ''),
    state: (row.state as Record<string, unknown>) ?? {},
    created_at: String(row.created_at),
  }
}

// rand()+rand() — 18 chars, plenty of entropy for share links (same id shape as SQLite rows).
function randId(): string {
  return rand() + rand()
}

export async function insertSnapshot(input: {
  title: string
  description: string
  state: Record<string, unknown>
  userId?: string | null
}): Promise<DbSnapshot> {
  if (!IS_CLOUD) {
    return sqliteInsert(input.title, input.description, input.state)
  }

  const sb = await supabase()
  const id = randId()
  const { data, error } = await sb
    .from('snapshots')
    .insert({
      id,
      user_id: input.userId ?? null,
      title: input.title.slice(0, 120),
      description: input.description.slice(0, 500),
      state: input.state,
    })
    .select()
    .single()

  if (error || !data) throw new Error(error?.message ?? 'Snapshot insert failed')
  return mapRow(data as Record<string, unknown>)
}

export async function getSnapshot(id: string): Promise<DbSnapshot | null> {
  if (!IS_CLOUD) return sqliteGet(id)

  const sb = await supabase()
  const { data, error } = await sb
    .from('snapshots')
    .select('*')
    .eq('id', id)
    .maybeSingle()

  if (error || !data) return null
  return mapRow(data as Record<string, unknown>)
}

export async function deleteSnapshot(id: string, userId: string): Promise<boolean> {
  if (!IS_CLOUD) return sqliteDelete(id)

  const sb = await supabase()
  // user_id filter is belt-and-braces — RLS already enforces ownership.
  const { error, count } = await sb
    .from('snapshots')
    .delete({ count: 'exact' })
    .eq('id', id)
    .eq('user_id', userId)
  return !error && (count ?? 0) > 0
}
