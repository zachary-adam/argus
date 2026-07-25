import { NextRequest, NextResponse } from 'next/server'
import { vaultGet } from '@/lib/vault'
import { logAiUsage } from '@/lib/logAiUsage'
import { getRequestUserId } from '@/lib/auth/getRequestUser'
import { resolveMaxTokens, type EffortLevel } from '@/lib/aiConfig'

import { ARGUS_INTEL_SYSTEM } from '@/lib/workspaceIntel'
import { parseModelJson } from '@/lib/parseModelJson'
import { assessEvidenceBalance, evidenceBalanceToPrompt } from '@/lib/evidenceBalance'
import { buildBriefEvidenceFromEvents, citedBriefSources } from '@/lib/briefSources'
import type { IntelEvent } from '@/types'
import type { CanvasBriefRequest, CanvasBriefResponse } from '@/types/canvasBrief'
import { generateCanvasBriefOffline } from '@/lib/offlineIntel'
import { planAiFromRequestWithProvider } from '@/lib/aiMode'
import { runCompletion } from '@/lib/aiComplete'

export type { CanvasBriefRequest, CanvasBriefResponse } from '@/types/canvasBrief'

const CANVAS_BRIEF_SYSTEM = `${ARGUS_INTEL_SYSTEM}

You are a senior intelligence analyst writing a canvas brief. You MUST respond with exactly one valid JSON object matching the requested schema — no markdown fences, no preamble, no prose before or after the JSON. Hindi or other non-English source titles are normal; analyze them and still output the JSON fields in English.`

export async function POST(req: NextRequest) {
  const body: CanvasBriefRequest = await req.json()
  const { projectName, researchQuestion, regionName, events, achFindings, analystNotes, papers, workspaceContext, watchEntities, countryCodes, apiKey: clientKey } = body

  const offlineBrief = (warning?: string) =>
    NextResponse.json<CanvasBriefResponse>({
      ...generateCanvasBriefOffline(body),
      offline: true,
      ...(warning ? { warning } : {}),
    })

  const plan = planAiFromRequestWithProvider(req, clientKey?.trim(), vaultGet, 'claude')
  if (plan.useOffline || plan.missingKeys || !plan.key) {
    return offlineBrief(
      plan.useOffline
        ? undefined
        : 'No AI key available — rules-based brief used instead.',
    )
  }

  const eventSlice = events.slice(0, 15)
  const bodyCap = eventSlice.length > 8 ? 450 : eventSlice.length > 4 ? 700 : 1200
  const mappedEvents: IntelEvent[] = eventSlice.map((e, i) => ({
    id: `canvas-ev-${i}`,
    title: e.title,
    summary: e.summary ?? '',
    body: e.body,
    category: e.category as IntelEvent['category'],
    country: e.country,
    countryCode: '',
    severity: e.severity >= 8 ? 'critical' : e.severity >= 6 ? 'high' : e.severity >= 4 ? 'medium' : 'low',
    timestamp: e.timestamp,
    source: (e.source ?? 'analyst') as IntelEvent['source'],
    url: e.url ?? '',
    lat: 0,
    lon: 0,
  }))
  const { corpus: eventCorpus, sources } = buildBriefEvidenceFromEvents(mappedEvents, {
    maxRich: 10,
    maxMeta: 10,
    maxCharsPerBody: bodyCap,
  })

  const achLines = achFindings.map((f, i) => {
    const others = f.allHypotheses
      .filter(h => h.text !== f.leadHypothesis)
      .map(h => `  • ${h.text} (supports:${h.supports}, contradicts:${h.contradicts})`)
      .join('\n')
    const note = f.narrative ? ` | Analyst note: ${f.narrative}` : ''
    return `ACH Matrix ${i + 1}:
  Lead hypothesis: "${f.leadHypothesis}" (supports:${f.leadSupports}, contradicts:${f.leadContradicts}) [CONF:${f.confidence.toUpperCase()}]${note}
  Competing hypotheses:\n${others || '  (none)'}`
  }).join('\n\n')

  const noteLines = analystNotes.filter(n => n.trim()).map(n => `• ${n.slice(0, 300)}`).join('\n')

  const paperLines = (papers ?? []).slice(0, 8).map((p, i) => {
    const auth = p.authors?.slice(0, 3).join(', ') ?? 'Unknown'
    const abs = p.abstract ? `\n   Abstract: ${p.abstract.slice(0, 500)}` : ''
    return `${i + 1}. "${p.title}" (${auth}${p.year ? `, ${p.year}` : ''})${p.venue ? ` | ${p.venue}` : ''}${abs}`
  }).join('\n')

  const evidenceBlock = evidenceBalanceToPrompt(
    assessEvidenceBalance(
      events.map(e => ({
        title: e.title,
        summary: e.summary ?? e.body,
        country: e.country,
        countryCode: '',
        source: (e.source ?? 'analyst') as IntelEvent['source'],
      })),
      { watchEntities, countryCodes },
    ),
  )

  const prompt = `Answer the research question using the evidence and ACH findings below.

${workspaceContext ? workspaceContext + '\n\n' : ''}${evidenceBlock}

RESEARCH QUESTION: "${researchQuestion}"

PROJECT: ${projectName} | REGION: ${regionName}
EVIDENCE BASE: ${events.length} events on canvas (${eventSlice.length} shown)

EVIDENCE (cite inline as [E#]):
${eventCorpus || 'No events imported yet.'}

ACH ANALYSIS (Analysis of Competing Hypotheses):
${achLines || 'No ACH analysis completed yet.'}

${paperLines ? `ACADEMIC / RESEARCH LITERATURE (analyst-selected — use for structural context, not as current reporting):\n${paperLines}\n` : ''}
${noteLines ? `ANALYST NOTES:\n${noteLines}` : ''}

Instructions:
- If academic papers are listed, use them for theoretical framing and long-cycle drivers — never cite them as proof of today's events
- Directly answer the research question — that is the purpose of this brief
- Use IC probability language: "almost certainly", "likely", "probably", "we assess", "cannot confirm"
- If ACH findings exist, ground your judgment in which hypothesis the evidence best supports
- Be specific — cite events by [E#] tag, actors, hypotheses by name
- If evidence is thin, say so explicitly in the confidence rationale
- Source titles may be in Hindi or English — read both; output JSON field values in English

Return ONLY this JSON object (no other text):
{
  "headline": "One sentence that directly answers the research question",
  "situation": "2-3 sentences describing what is currently happening based on the events",
  "keyFindings": ["3-5 specific findings from the evidence — each one a complete sentence"],
  "riskLevel": "CRITICAL or HIGH or MODERATE or LOW",
  "riskRationale": "1-2 sentences explaining why this risk level, citing specific events or ACH findings",
  "assessmentInsight": "1-2 sentences on what the ACH matrix reveals — which hypothesis the evidence most supports and why",
  "watchItems": ["3-4 specific indicators or developments to monitor over the next 30 days"],
  "analystJudgment": "2-3 sentences of synthesis — your bottom-line answer grounded in the ACH lead hypothesis with confidence hedging",
  "confidence": "HIGH or MODERATE or LOW",
  "confidenceRationale": "Why this confidence level — cite event count, source diversity, recency, ACH hypothesis separation"
}`

  try {
    const effort = (req.headers.get('x-effort') ?? 'medium') as EffortLevel
    const t0 = Date.now()
    const userIdPromise = getRequestUserId()

    const completion = await runCompletion(plan, {
      system: CANVAS_BRIEF_SYSTEM,
      prompt,
      maxTokens: resolveMaxTokens(effort, 3000),
      effort,
      temperature: 0.3,
      jsonResponse: !plan.isAnthropic,
      timeoutMs: 90_000,
    })

    const userId = await userIdPromise.catch(() => null)
    logAiUsage({
      feature: 'canvas_brief', provider: completion.provider, model: completion.model, effort,
      input_tokens: completion.inputTokens,
      output_tokens: completion.outputTokens,
      duration_ms: Date.now() - t0,
      context: researchQuestion.slice(0, 120),
      user_id: userId ?? undefined,
    }).catch(() => {})

    const result = parseModelJson<CanvasBriefResponse>(completion.raw)
    result.sources = citedBriefSources(sources, completion.raw)
    return NextResponse.json(result)
  } catch (err) {
    const raw = err instanceof Error ? err.message : 'Brief generation failed'
    console.error('[canvas-brief]', raw)
    const authFail = /401|authentication_error|invalid x-api-key|invalid_api_key/i.test(raw)
    return offlineBrief(
      authFail
        ? 'AI key rejected — rules-based brief used instead.'
        : 'AI unavailable — rules-based brief used instead.',
    )
  }
}
