import { NextResponse } from 'next/server'
import { getCache } from '@/lib/cache'
import { IntelEvent, AircraftPosition, VesselPosition } from '@/types'
import { vaultGet } from '@/lib/vault'

export interface SourceEntry {
  id: string
  label: string
  count: number
  ok: boolean
  keyRequired: boolean
  hasKey?: boolean
  pending?: boolean
  optional?: boolean
}

export interface StatusResponse {
  fetchedAt: string | null
  sources: SourceEntry[]
  aviation: { count: number; ok: boolean; pending: boolean }
  vessels:  { count: number; ok: boolean; pending: boolean; optional?: boolean }
  vault: { configured: boolean; keys: string[] }
  aiAvailable: boolean
  usingDemo: boolean
  usingFallback: boolean
  aisStreamLive: boolean
}

export async function GET(): Promise<NextResponse<StatusResponse>> {
  const sourceStatus = getCache<{ fetchedAt: string; sources: SourceEntry[] }>('source-status')
  const aircraft     = getCache<AircraftPosition[]>('aviation')
  // Vessels live in the AISStream singleton (populated by the SSE stream), not the
  // 'vessels' cache — read the same source correlations does so the count is real.
  const vessels: VesselPosition[] = typeof globalThis.__aisstream !== 'undefined'
    ? Array.from(globalThis.__aisstream.vesselStore.values())
    : []
  const events       = getCache<IntelEvent[]>('all-events')

  let vaultKeys: string[] = []
  let vaultConfigured = false
  try {
    const { vaultList, vaultConfigured: vc } = await import('@/lib/vault')
    vaultConfigured = vc()
    vaultKeys = vaultConfigured ? vaultList() : []
  } catch {}

  const usingDemo = !!(events?.some((e: any) => e.tags?.includes('demo')))
  const usingFallback = !!(getCache<boolean>('gdelt-using-fallback'))
  const hasAisKey = !!(vaultGet('AISSTREAM_API_KEY') ?? process.env.AISSTREAM_API_KEY)
  const aiAvailable = !!(
    vaultGet('OPENAI_API_KEY') ?? process.env.OPENAI_API_KEY
    ?? vaultGet('ANTHROPIC_API_KEY') ?? process.env.ANTHROPIC_API_KEY
  )

  // null cache = not yet fetched (pending), not a failure.
  // Vessels: empty store with an AIS key means the stream is still warming up (or
  // the project is land-focused with no ships nearby) — pending, not "failed".
  return NextResponse.json({
    fetchedAt:    sourceStatus?.fetchedAt ?? null,
    sources:      sourceStatus?.sources ?? [],
    aviation:     { count: aircraft?.length ?? 0, ok: aircraft === null || aircraft.length > 0, pending: aircraft === null },
    vessels:      {
      count: vessels.length,
      ok: vessels.length > 0 || !hasAisKey,
      pending: hasAisKey && vessels.length === 0,
      optional: true,
    },
    vault:        { configured: vaultConfigured, keys: vaultKeys },
    aiAvailable,
    usingDemo,
    usingFallback,
    aisStreamLive: !!process.env.AISSTREAM_API_KEY,
  })
}
