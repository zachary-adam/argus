import { NextRequest, NextResponse } from 'next/server'
import { getRequestUserId } from '@/lib/auth/getRequestUser'

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL
const SUPABASE_KEY = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY

interface LogRow {
  id: string; created_at: string; feature: string; provider: string; model: string
  effort: string; input_tokens: number; output_tokens: number; total_tokens: number
  cost_usd: number; duration_ms: number | null; context: string | null
  project_id: string | null; user_id: string | null
}

function cutoff(range: string): string {
  const now = new Date()
  if (range === '24h')  { now.setHours(now.getHours() - 24); return now.toISOString() }
  if (range === '7d')   { now.setDate(now.getDate() - 7);    return now.toISOString() }
  if (range === '30d')  { now.setDate(now.getDate() - 30);   return now.toISOString() }
  return '1970-01-01T00:00:00Z'
}

export async function GET(req: NextRequest) {
  if (!SUPABASE_URL || !SUPABASE_KEY) {
    return NextResponse.json({ error: 'Supabase not configured' }, { status: 503 })
  }

  // Require authenticated user — never expose another user's data
  const userId = await getRequestUserId().catch(() => null)
  if (!userId) {
    return NextResponse.json({ error: 'Not authenticated' }, { status: 401 })
  }

  const { searchParams } = new URL(req.url)
  const range   = searchParams.get('range')   ?? '30d'
  const feature = searchParams.get('feature') ?? ''

  // Filter by BOTH time range AND user_id — no cross-user data leakage possible
  let url = `${SUPABASE_URL}/rest/v1/ai_usage_logs?select=*&created_at=gte.${cutoff(range)}&user_id=eq.${encodeURIComponent(userId)}&order=created_at.desc&limit=2000`
  if (feature) url += `&feature=eq.${feature}`

  const res = await fetch(url, {
    headers: { 'apikey': SUPABASE_KEY, 'Authorization': `Bearer ${SUPABASE_KEY}` },
  })

  if (!res.ok) return NextResponse.json({ error: 'Failed to fetch logs' }, { status: 500 })

  const rows: LogRow[] = await res.json()

  // ── Aggregations ──────────────────────────────────────────────────────
  const totalCalls  = rows.length
  const totalTokens = rows.reduce((s, r) => s + r.total_tokens, 0)
  const totalCost   = rows.reduce((s, r) => s + Number(r.cost_usd), 0)
  const timedRows   = rows.filter(r => r.duration_ms)
  const avgDuration = timedRows.length ? Math.round(timedRows.reduce((s, r) => s + (r.duration_ms ?? 0), 0) / timedRows.length) : 0

  const byFeature: Record<string, { calls: number; tokens: number; cost: number }> = {}
  const byModel:   Record<string, { calls: number; tokens: number; cost: number }> = {}
  const byEffort:  Record<string, { calls: number; tokens: number; cost: number }> = {}
  const daily:     Record<string, { calls: number; tokens: number; cost: number }> = {}

  for (const r of rows) {
    const add = (obj: typeof byFeature, key: string) => {
      if (!obj[key]) obj[key] = { calls: 0, tokens: 0, cost: 0 }
      obj[key].calls  += 1
      obj[key].tokens += r.total_tokens
      obj[key].cost   += Number(r.cost_usd)
    }
    add(byFeature, r.feature)
    add(byModel,   r.model)
    add(byEffort,  r.effort)
    add(daily,     r.created_at.slice(0, 10))
  }

  const dailySeries = Object.entries(daily)
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([date, v]) => ({ date, ...v }))

  const recent = rows.slice(0, 100).map(r => ({
    id: r.id, created_at: r.created_at, feature: r.feature, provider: r.provider,
    model: r.model, effort: r.effort,
    input_tokens: r.input_tokens, output_tokens: r.output_tokens, total_tokens: r.total_tokens,
    cost_usd: Number(r.cost_usd), duration_ms: r.duration_ms, context: r.context,
    project_id: r.project_id,
  }))

  return NextResponse.json({
    summary: { totalCalls, totalTokens, totalCost, avgDuration },
    byFeature, byModel, byEffort, dailySeries, recent,
  })
}
