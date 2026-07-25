/**
 * Server-side plot store — SQLite locally, Supabase in cloud mode.
 *
 * Local schema preserves the workspace_id column; cloud rows are scoped by
 * user_id (no workspace concept). Caller passes a workspaceId for local mode
 * and a userId for cloud; the store ignores whichever doesn't apply.
 */
import {
  plotsList as sqliteList,
  plotInsert as sqliteInsert,
  plotUpdate as sqliteUpdate,
  plotDelete as sqliteDelete,
  workspaceGetDefault as sqliteWorkspace,
  rand,
  type DbPlot,
} from '@/lib/db'
import { IS_CLOUD_MODE as IS_CLOUD } from '@/lib/supabase/config'

export type { DbPlot }

async function supabase() {
  const { createClient } = await import('@/lib/supabase/server')
  return createClient()
}

function mapRow(row: Record<string, unknown>): DbPlot {
  return {
    id: String(row.id),
    workspace_id: row.user_id != null ? String(row.user_id) : '',
    type: String(row.type),
    coordinates: row.coordinates as unknown,
    label: String(row.label ?? ''),
    properties: (row.properties as Record<string, unknown>) ?? {},
    created_at: String(row.created_at),
  }
}

export async function listPlots(opts: { userId?: string | null; workspaceId?: string }): Promise<DbPlot[]> {
  if (!IS_CLOUD) {
    const wsId = opts.workspaceId ?? sqliteWorkspace().id
    return sqliteList(wsId)
  }

  if (!opts.userId) return []
  const sb = await supabase()
  const { data, error } = await sb
    .from('plots')
    .select('*')
    .eq('user_id', opts.userId)
    .order('created_at', { ascending: false })
  if (error) return []
  return (data ?? []).map(r => mapRow(r as Record<string, unknown>))
}

export async function insertPlot(input: {
  userId?: string | null
  workspaceId?: string
  type: string
  coordinates: unknown
  label?: string
  properties?: Record<string, unknown>
}): Promise<DbPlot> {
  if (!IS_CLOUD) {
    const wsId = input.workspaceId ?? sqliteWorkspace().id
    return sqliteInsert(wsId, input.type, input.coordinates, input.label ?? '', input.properties ?? {})
  }

  if (!input.userId) throw new Error('Unauthorized')
  const sb = await supabase()
  const id = rand()
  const { data, error } = await sb
    .from('plots')
    .insert({
      id,
      user_id: input.userId,
      type: input.type,
      coordinates: input.coordinates,
      label: input.label ?? '',
      properties: input.properties ?? {},
    })
    .select()
    .single()

  if (error || !data) throw new Error(error?.message ?? 'Plot insert failed')
  return mapRow(data as Record<string, unknown>)
}

export async function updatePlot(input: {
  id: string
  userId?: string | null
  label: string
  properties: Record<string, unknown>
}): Promise<DbPlot | null> {
  if (!IS_CLOUD) return sqliteUpdate(input.id, input.label, input.properties)

  if (!input.userId) return null
  const sb = await supabase()
  const { data, error } = await sb
    .from('plots')
    .update({ label: input.label, properties: input.properties })
    .eq('id', input.id)
    .eq('user_id', input.userId)
    .select()
    .single()

  if (error || !data) return null
  return mapRow(data as Record<string, unknown>)
}

export async function deletePlot(id: string, userId: string | null | undefined): Promise<boolean> {
  if (!IS_CLOUD) { sqliteDelete(id); return true }

  if (!userId) return false
  const sb = await supabase()
  const { error, count } = await sb
    .from('plots')
    .delete({ count: 'exact' })
    .eq('id', id)
    .eq('user_id', userId)
  return !error && (count ?? 0) > 0
}
