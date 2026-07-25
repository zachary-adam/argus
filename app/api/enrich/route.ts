import { NextRequest, NextResponse } from 'next/server'
import { checkRateLimit, getClientIp } from '@/lib/rateLimit'
import { vaultGet } from '@/lib/vault'
import { logAiUsage } from '@/lib/logAiUsage'
import { getRequestUserId } from '@/lib/auth/getRequestUser'
import { planAiFromRequestWithProvider } from '@/lib/aiMode'
import { runCompletion } from '@/lib/aiComplete'

interface RawEvent {
  id: string
  title: string
  description?: string
  body?: string      // full article text when available
  location?: string
  timestamp?: string
}

interface EnrichedEvent {
  id: string
  severity: 'critical' | 'high' | 'medium' | 'low'
  category: string
  actors: string[]
  country: string
  city: string
  lat: number
  lon: number
  summary: string
  tags: string[]
}

const SYSTEM_PROMPT = `You are an intelligence analyst. Given raw news/event data, return structured analysis.
For each event return:
- severity: critical/high/medium/low (based on geopolitical impact, casualties, instability)
- category: conflict/political/economic/social/security/humanitarian/disaster/health/military
- actors: array of named people, groups, states, organizations mentioned (max 5, proper names only)
- country: primary country name (full name, e.g. "Ukraine" not "UA")
- city: city or region name if identifiable, else ""
- lat: decimal latitude of primary location (0 if unknown)
- lon: decimal longitude of primary location (0 if unknown)
- summary: 2-sentence intelligence summary in analyst style (factual, third-person, present tense)
- tags: 3-5 keyword tags (lowercase, e.g. ["artillery", "ceasefire", "nato"])

Return JSON: { "results": [ { "id": "...", "severity": "...", ... }, ... ] }`

export async function POST(req: NextRequest) {
  const ip = getClientIp(req)
  if (!checkRateLimit(`enrich:${ip}`, 10, 60_000)) {
    return NextResponse.json({ error: 'Too many requests' }, { status: 429 })
  }

  try {
    const { events, apiKey } = await req.json() as { events: RawEvent[]; apiKey?: string }
    if (!events?.length) return NextResponse.json({ error: 'events required' }, { status: 400 })

    const preferredProvider = (req.headers.get('x-ai-provider') ?? 'openai') as 'claude' | 'openai'
    const effort = (req.headers.get('x-effort') ?? 'medium') as import('@/lib/aiConfig').EffortLevel
    const { resolveMaxTokens } = await import('@/lib/aiConfig')

    const plan = planAiFromRequestWithProvider(req, apiKey?.trim(), vaultGet, preferredProvider)
    if (plan.useOffline || plan.missingKeys || !plan.key) {
      return NextResponse.json({ error: 'No AI API key configured' }, { status: 400 })
    }

    const batch = events.slice(0, 8)

    const userContent = batch.map(e => {
      const parts = [
        `ID: ${e.id}`,
        `Title: ${e.title}`,
        `Description: ${(e.description ?? '').slice(0, 300)}`,
      ]
      if (e.body && e.body.length > 50) parts.push(`Article excerpt: ${e.body.slice(0, 500)}`)
      if (e.location) parts.push(`Location hint: ${e.location}`)
      return parts.join('\n')
    }).join('\n\n---\n\n')

    const t0 = Date.now()
    const userIdPromise = getRequestUserId()

    const completion = await runCompletion(plan, {
      system: SYSTEM_PROMPT,
      prompt: userContent,
      maxTokens: resolveMaxTokens(effort, 2000),
      temperature: 0.2,
      timeoutMs: 30000,
      jsonResponse: !plan.isAnthropic,
      effort,
    })

    const userId = await userIdPromise.catch(() => null)
    logAiUsage({
      feature: 'enrich', provider: completion.provider,
      model: completion.model,
      effort, input_tokens: completion.inputTokens, output_tokens: completion.outputTokens,
      duration_ms: Date.now() - t0,
      context: `${batch.length} events`,
      user_id: userId ?? undefined,
    }).catch(() => {})

    const cleaned = completion.raw.replace(/```json|```/g, '').trim()
    const jsonText = cleaned.startsWith('{')
      ? cleaned
      : cleaned.slice(cleaned.indexOf('{'), cleaned.lastIndexOf('}') + 1)
    const parsed = JSON.parse(jsonText) as { results?: EnrichedEvent[] }
    const results: EnrichedEvent[] = parsed.results ?? []

    return NextResponse.json({ results })
  } catch {
    return NextResponse.json({ error: 'Enrichment failed' }, { status: 500 })
  }
}
