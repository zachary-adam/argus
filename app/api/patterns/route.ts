import { NextRequest, NextResponse } from 'next/server'
import type { IntelEvent } from '@/types'
import type { Pattern } from '@/types/project'
import { checkRateLimit, getClientIp } from '@/lib/rateLimit'
import { vaultGet } from '@/lib/vault'
import { parseModelJson } from '@/lib/parseModelJson'
import { logAiUsage } from '@/lib/logAiUsage'
import { getRequestUserId } from '@/lib/auth/getRequestUser'
import { planAiFromRequestWithProvider, AI_KEYS_MISSING_BODY } from '@/lib/aiMode'
import { runCompletion } from '@/lib/aiComplete'
import { makePatternId } from '@/lib/patternRules'

interface PatternsRequest {
  events: IntelEvent[]
  journalSnippets?: string[]
  paperTitles?: string[]
  windowHours?: number
  apiKey?: string
}

// Words that turn a descriptive pattern into a prediction — we strip any pattern
// that uses them so the feature stays in its lane (observed, not forecasted).
const FORBIDDEN_WORDS = /\b(will|predict|guarantee|expected to|definitely|certainly|forecast)\b/i

const SYSTEM_PROMPT = `You are an analyst extracting OBSERVED if/then patterns from intelligence data. You DESCRIBE what the corpus shows; you NEVER predict.

Return a JSON object with this exact shape:
{
  "patterns": [
    {
      "name": "Short noun phrase (max 60 chars)",
      "if": "Trigger condition observed in the corpus",
      "then": "Observation that tends to follow",
      "eventIds": ["evt_id_1", "evt_id_2", ...],
      "confidence": "low" | "moderate" | "high"
    }
  ]
}

Hard rules — violations cause the pattern to be discarded server-side:
- Use ONLY event ids that appear in the corpus you were given.
- Every pattern MUST cite at least 2 distinct eventIds.
- Do NOT use the words: will, predict, guarantee, expected to, definitely, certainly, forecast.
- Phrase "then" as observed recurrence, not prophecy. ✓ "X follows Y in ~70% of observed cases"  ✗ "X will follow Y".
- Max 5 patterns. Quality over quantity.`

function summarizeEvents(events: IntelEvent[], cap = 60): string {
  return events.slice(0, cap).map((e) => {
    const date = new Date(e.timestamp).toISOString().slice(0, 10)
    const actors = e.actors?.slice(0, 3).map(a => a.name).join(', ')
    return `id=${e.id} | ${date} | ${e.country} | sev=${e.severity} | cat=${e.category} | src=${e.source}${actors ? ` | actors: ${actors}` : ''} | "${e.title}"`
  }).join('\n')
}

export async function POST(req: NextRequest) {
  const ip = getClientIp(req)
  if (!checkRateLimit(`patterns:${ip}`, 10, 60_000)) {
    return NextResponse.json({ error: 'Too many requests' }, { status: 429 })
  }

  const body = (await req.json().catch(() => ({}))) as PatternsRequest
  const events = Array.isArray(body.events) ? body.events : []
  if (events.length < 3) {
    return NextResponse.json({ error: 'Need at least 3 events to extract patterns' }, { status: 400 })
  }

  const plan = planAiFromRequestWithProvider(req, body.apiKey?.trim(), vaultGet, 'claude')
  if (plan.useOffline || plan.missingKeys || !plan.key) {
    return NextResponse.json(AI_KEYS_MISSING_BODY, { status: 400 })
  }

  const corpus = summarizeEvents(events)
  const journal = (body.journalSnippets ?? []).slice(0, 12).filter(Boolean).join('\n---\n')
  const papers = (body.paperTitles ?? []).slice(0, 12).filter(Boolean).join('\n')

  const userPrompt = [
    `EVENTS (${events.length} total, ids you may cite):\n${corpus}`,
    journal ? `\nANALYST JOURNAL NOTES:\n${journal}` : '',
    papers ? `\nLINKED RESEARCH PAPERS:\n${papers}` : '',
    `\nExtract observed if/then patterns. Output the JSON object only.`,
  ].filter(Boolean).join('\n')

  const t0 = Date.now()
  const userIdPromise = getRequestUserId()
  const eventIds = new Set(events.map(e => e.id))

  let completion: Awaited<ReturnType<typeof runCompletion>>
  try {
    completion = await runCompletion(plan, {
      system: SYSTEM_PROMPT,
      prompt: userPrompt,
      maxTokens: 1500,
      effort: 'low',
      jsonResponse: true,
    })
  } catch (e) {
    return NextResponse.json({ error: `Pattern extraction failed: ${(e as Error).message}` }, { status: 502 })
  }
  const { raw, provider, model, inputTokens, outputTokens } = completion

  type RawPattern = { name?: string; if?: string; then?: string; eventIds?: string[]; confidence?: string }
  let parsed: { patterns?: RawPattern[] } = {}
  try { parsed = parseModelJson<{ patterns?: RawPattern[] }>(raw) } catch { parsed = { patterns: [] } }

  const now = new Date().toISOString()
  const patterns: Pattern[] = []
  for (const p of parsed.patterns ?? []) {
    const name = (p.name ?? '').trim()
    const ifClause = (p.if ?? '').trim()
    const thenClause = (p.then ?? '').trim()
    if (!name || !ifClause || !thenClause) continue
    // Discard predictive language.
    if (FORBIDDEN_WORDS.test(name) || FORBIDDEN_WORDS.test(ifClause) || FORBIDDEN_WORDS.test(thenClause)) continue
    // Validate cited event ids against the corpus we sent.
    const cited = Array.from(new Set((p.eventIds ?? []).filter(id => eventIds.has(id))))
    if (cited.length < 2) continue
    const confidence: Pattern['confidence'] =
      p.confidence === 'high' || p.confidence === 'moderate' || p.confidence === 'low' ? p.confidence : 'moderate'
    patterns.push({
      id: makePatternId(),
      name: name.slice(0, 80),
      if: ifClause.slice(0, 220),
      then: thenClause.slice(0, 220),
      source: 'ai',
      evidence: { eventIds: cited.slice(0, 24) },
      // The AI doesn't backtest, so it has no real hit/miss record. Leave these
      // at zero rather than fabricating a 100% hit rate — the UI shows the
      // citation count for AI patterns instead. Confidence comes from the model.
      hits: 0,
      misses: 0,
      hitRate: 0,
      confidence,
      windowHours: body.windowHours ?? 48,
      createdAt: now,
    })
  }

  const userId = await userIdPromise.catch(() => null)
  logAiUsage({
    feature: 'patterns',
    provider,
    model,
    effort: 'low',
    input_tokens: inputTokens,
    output_tokens: outputTokens,
    duration_ms: Date.now() - t0,
    context: `events=${events.length}, kept=${patterns.length}`,
    user_id: userId ?? undefined,
  }).catch(() => {})

  return NextResponse.json({ patterns, provider, kept: patterns.length, proposed: parsed.patterns?.length ?? 0 })
}
