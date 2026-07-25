import { IS_CLOUD_MODE } from '@/lib/supabase/config'
import { isMissingTableError } from '@/lib/supabase/errors'

// One entry per migration file, listing every table it creates.
// supabase/MIGRATIONS.md and scripts/check-cloud.mjs must stay in step with this list.
export const SUPABASE_MIGRATIONS = [
  { id: 'projects', tables: ['projects'], file: 'supabase/schema.sql' },
  { id: 'intel_history', tables: ['intel_briefs', 'nlq_history'], file: 'supabase/migrations/20260622_intel_history.sql' },
  { id: 'plots', tables: ['plots'], file: 'supabase/migrations/20260629_plots.sql' },
  { id: 'snapshots', tables: ['snapshots'], file: 'supabase/migrations/20260629_snapshots.sql' },
  { id: 'research_journal', tables: ['journal_entries', 'hypothesis_revisions', 'event_paper_links'], file: 'supabase/migrations/20260701_research_journal.sql' },
  { id: 'ai_usage', tables: ['ai_usage_logs'], file: 'supabase/migrations/20260613_ai_usage_logs.sql' },
] as const

export type CloudSchemaStatus = {
  ok: boolean
  missing: string[]
  checked: string[]
}

/** Probe which expected Supabase tables exist (cloud mode only). */
export async function checkCloudSchema(): Promise<CloudSchemaStatus> {
  if (!IS_CLOUD_MODE) return { ok: true, missing: [], checked: [] }

  const { createClient } = await import('@/lib/supabase/server')
  const sb = await createClient()
  const tables = SUPABASE_MIGRATIONS.flatMap(m => [...m.tables])

  const results = await Promise.all(
    tables.map(async table => {
      const { error } = await sb.from(table).select('id', { head: true, count: 'exact' }).limit(1)
      return { table, missing: isMissingTableError(error) }
    }),
  )

  return {
    ok: results.every(r => !r.missing),
    missing: results.filter(r => r.missing).map(r => r.table),
    checked: tables,
  }
}
