import { NextRequest, NextResponse } from 'next/server'
import { IntelEvent } from '@/types'
import { checkRateLimit } from '@/lib/rateLimit'
import { vaultGet } from '@/lib/vault'
import { logAiUsage } from '@/lib/logAiUsage'
import { getRequestUserId } from '@/lib/auth/getRequestUser'
import { ARGUS_INTEL_SYSTEM } from '@/lib/workspaceIntel'
import { nlqOffline, prefilterNlqCandidates } from '@/lib/offlineIntel'
import { AI_KEYS_MISSING_BODY, planAiFromRequestWithProvider } from '@/lib/aiMode'
import { parseModelJson } from '@/lib/parseModelJson'
import { runCompletion } from '@/lib/aiComplete'

export interface NlqResponse {
  matchingIds: string[]
  summary: string
  appliedFilters: string
  flyTo: { lat: number; lon: number; zoom: number } | null
  resultCount: number
  offline?: boolean
}

const SYSTEM = `${ARGUS_INTEL_SYSTEM}

You are answering a natural-language query over a LIVE analyst event feed inside ARGUS.

PART 1 — Final matching (from pre-filtered candidates):
- Identify which events genuinely match the analyst's query intent
- Return only their IDs — never fabricate IDs not in the list

PART 2 — Intelligence assessment (main value — must beat raw Claude chat):
Write a 4–6 sentence analytical assessment that:
- Opens with what matched events collectively signal (count, geography, severity pattern)
- References the analyst's research question / cases / flagged alerts from workspace context when relevant
- Draws structural drivers and escalation trajectory the titles alone don't capture
- Cites specific event titles or countries from the matched set
- Closes with a concrete watch item tied to this project's monitoring frame
- Tone: confident IC-style. No filler. Never generic textbook geopolitics.

Rules:
- flyTo: centroid of matched coords; zoom = city(7), country(5), region(4), multi-region(3), global(2)
- appliedFilters: compact label e.g. "Conflict · Iran · 48h"
- Never use markdown inside JSON string values.

Respond with JSON only:
{
  "matchingIds": ["id1", "id2"],
  "summary": "...",
  "appliedFilters": "...",
  "flyTo": { "lat": 0, "lon": 0, "zoom": 4 }
}`

export async function POST(req: NextRequest) {
  const ip = req.headers.get('x-forwarded-for') ?? req.headers.get('x-real-ip') ?? 'local'
  if (!checkRateLimit(`nlq:${ip}`, 60, 60_000)) return NextResponse.json({ error: 'Rate limited' }, { status: 429 })

  const { query, events, workspaceContext, apiKey: clientKey } = await req.json() as {
    query: string
    events: IntelEvent[]
    workspaceContext?: string
    apiKey?: string
  }

  if (!query?.trim()) return NextResponse.json({ error: 'query required' }, { status: 400 })
  if (!events?.length) return NextResponse.json<NlqResponse>({
    matchingIds: [], summary: 'No events loaded yet.', appliedFilters: '', flyTo: null, resultCount: 0,
  })

  const effort = (req.headers.get('x-effort') ?? 'medium') as import('@/lib/aiConfig').EffortLevel
  const { resolveMaxTokens } = await import('@/lib/aiConfig')
  const plan = planAiFromRequestWithProvider(req, clientKey?.trim(), vaultGet, 'claude')

  if (plan.useOffline) {
    return NextResponse.json<NlqResponse>({ ...nlqOffline(query, events), offline: true })
  }
  if (plan.missingKeys) {
    return NextResponse.json(AI_KEYS_MISSING_BODY, { status: 400 })
  }

  const ranked = prefilterNlqCandidates(query, events)

  // Compact to minimal fields — id + title is enough for matching, country+severity for context
  const compact = ranked.slice(0, 150).map(e => ({
    id: e.id,
    t: e.title,                                      // title
    c: e.country ?? '',                              // country
    s: e.severity[0],                               // severity first char (c/h/m/l)
    k: e.category?.[0] ?? '',                       // category first char
    ts: e.timestamp ? e.timestamp.slice(0, 10) : '', // date only
  }))

  const userMsg = `${workspaceContext ? workspaceContext + '\n\n' : ''}Query: "${query}"

Note: candidates were keyword pre-filtered with severe recent events added as safety net. If answering well requires events not present, say so in the summary.

Candidates (${compact.length} of ${events.length} total events):
${JSON.stringify(compact)}`

  try {
    const t0 = Date.now()
    const userIdPromise = getRequestUserId()

    const completion = await runCompletion(plan, {
      system: SYSTEM,
      prompt: userMsg,
      maxTokens: resolveMaxTokens(effort, 1024),
      effort,
      jsonResponse: true,
    })

    const userId = await userIdPromise.catch(() => null)
    logAiUsage({
      feature: 'nlq', provider: completion.provider,
      model: completion.model,
      effort, input_tokens: completion.inputTokens, output_tokens: completion.outputTokens,
      duration_ms: Date.now() - t0,
      context: query.slice(0, 80),
      user_id: userId ?? undefined,
    }).catch(() => {})

    const parsed = parseModelJson<{
      matchingIds?: string[]
      summary?: string
      appliedFilters?: string
      flyTo?: { lat: number; lon: number; zoom: number } | null
    }>(completion.raw)
    const matchingIds: string[] = (parsed.matchingIds ?? []).filter((id: string) =>
      events.some(e => e.id === id)
    )

    return NextResponse.json<NlqResponse>({
      matchingIds,
      summary: parsed.summary ?? '',
      appliedFilters: parsed.appliedFilters ?? '',
      flyTo: parsed.flyTo ?? null,
      resultCount: matchingIds.length,
    })
  } catch (err) {
    console.error('[nlq] error:', err)
    return NextResponse.json({ error: 'Query failed' }, { status: 500 })
  }
}
