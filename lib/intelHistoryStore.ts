/**
 * Server-side intelligence history — SQLite locally, Supabase in cloud mode.
 */
import {
  briefsList as sqliteBriefsList,
  briefInsert as sqliteBriefInsert,
  briefDelete as sqliteBriefDelete,
  nlqHistoryList as sqliteNlqList,
  nlqHistoryInsert as sqliteNlqInsert,
  nlqHistoryDelete as sqliteNlqDelete,
  type DbBrief,
  type DbNlqHistory,
} from '@/lib/db'

const IS_CLOUD = process.env.NEXT_PUBLIC_MODE === 'cloud'

export type { DbBrief, DbNlqHistory }

async function supabase() {
  const { createClient } = await import('@/lib/supabase/server')
  return createClient()
}

function mapBrief(row: Record<string, unknown>): DbBrief {
  return {
    id: String(row.id),
    type: (row.type as DbBrief['type']) || 'country',
    title: String(row.title ?? ''),
    country: String(row.country ?? ''),
    country_code: String(row.country_code ?? ''),
    project_id: row.project_id != null ? String(row.project_id) : null,
    user_id: row.user_id != null ? String(row.user_id) : null,
    data: (row.data as Record<string, unknown>) ?? null,
    summary: String(row.summary ?? ''),
    created_at: String(row.created_at),
  }
}

function mapNlq(row: Record<string, unknown>): DbNlqHistory {
  return {
    id: String(row.id),
    user_id: row.user_id != null ? String(row.user_id) : null,
    project_id: row.project_id != null ? String(row.project_id) : null,
    query: String(row.query ?? ''),
    summary: String(row.summary ?? ''),
    applied_filters: String(row.applied_filters ?? ''),
    match_count: Number(row.match_count ?? 0),
    created_at: String(row.created_at),
  }
}

export async function listBriefs(opts: {
  limit?: number
  projectId?: string
  userId: string
}): Promise<DbBrief[]> {
  if (!IS_CLOUD) {
    return sqliteBriefsList({ limit: opts.limit, projectId: opts.projectId, userId: opts.userId })
  }

  const sb = await supabase()
  let query = sb
    .from('intel_briefs')
    .select('*')
    .order('created_at', { ascending: false })
    .limit(opts.limit ?? 30)
  if (opts.projectId) query = query.eq('project_id', opts.projectId)

  const { data, error } = await query
  if (error) throw new Error(error.message)
  return (data ?? []).map(r => mapBrief(r as Record<string, unknown>))
}

export async function insertBrief(input: {
  type: DbBrief['type']
  title: string
  country?: string
  countryCode?: string
  projectId?: string
  userId: string
  data: Record<string, unknown>
  summary: string
}): Promise<DbBrief> {
  if (!IS_CLOUD) {
    return sqliteBriefInsert(input)
  }

  const sb = await supabase()
  const { data, error } = await sb
    .from('intel_briefs')
    .insert({
      user_id: input.userId,
      type: input.type,
      title: input.title.slice(0, 160),
      country: (input.country ?? '').slice(0, 120),
      country_code: (input.countryCode ?? '').slice(0, 8),
      project_id: input.projectId ?? null,
      data: input.data,
      summary: input.summary.slice(0, 300),
    })
    .select()
    .single()

  if (error || !data) throw new Error(error?.message ?? 'Insert failed')
  return mapBrief(data as Record<string, unknown>)
}

export async function deleteBrief(id: string, userId: string): Promise<boolean> {
  if (!IS_CLOUD) return sqliteBriefDelete(id, userId)

  const sb = await supabase()
  const { error, count } = await sb
    .from('intel_briefs')
    .delete({ count: 'exact' })
    .eq('id', id)
    .eq('user_id', userId)
  return !error && (count ?? 0) > 0
}

export async function listNlqHistory(opts: {
  limit?: number
  projectId?: string
  userId: string
}): Promise<DbNlqHistory[]> {
  if (!IS_CLOUD) {
    return sqliteNlqList({ limit: opts.limit, projectId: opts.projectId, userId: opts.userId })
  }

  const sb = await supabase()
  let query = sb
    .from('nlq_history')
    .select('*')
    .order('created_at', { ascending: false })
    .limit(opts.limit ?? 30)
  if (opts.projectId) query = query.eq('project_id', opts.projectId)

  const { data, error } = await query
  if (error) throw new Error(error.message)
  return (data ?? []).map(r => mapNlq(r as Record<string, unknown>))
}

export async function insertNlqHistory(input: {
  query: string
  summary: string
  appliedFilters?: string
  matchCount?: number
  projectId?: string
  userId: string
}): Promise<DbNlqHistory> {
  if (!IS_CLOUD) {
    return sqliteNlqInsert(input)
  }

  const sb = await supabase()
  const { data, error } = await sb
    .from('nlq_history')
    .insert({
      user_id: input.userId,
      project_id: input.projectId ?? null,
      query: input.query.slice(0, 500),
      summary: input.summary.slice(0, 2000),
      applied_filters: (input.appliedFilters ?? '').slice(0, 200),
      match_count: input.matchCount ?? 0,
    })
    .select()
    .single()

  if (error || !data) throw new Error(error?.message ?? 'Insert failed')
  return mapNlq(data as Record<string, unknown>)
}

export async function deleteNlqHistory(id: string, userId: string): Promise<boolean> {
  if (!IS_CLOUD) return sqliteNlqDelete(id, userId)

  const sb = await supabase()
  const { error, count } = await sb
    .from('nlq_history')
    .delete({ count: 'exact' })
    .eq('id', id)
    .eq('user_id', userId)
  return !error && (count ?? 0) > 0
}
