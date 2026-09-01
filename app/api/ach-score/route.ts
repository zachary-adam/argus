import { NextRequest, NextResponse } from 'next/server'
import { vaultGet } from '@/lib/vault'
import { ARGUS_INTEL_SYSTEM } from '@/lib/workspaceIntel'
import type { ACHEventScore } from '@/types/project'
import { scoreACHOffline } from '@/lib/offlineIntel'
import { planAiFromRequestWithProvider } from '@/lib/aiMode'
import { parseModelJson } from '@/lib/parseModelJson'
import { runCompletion } from '@/lib/aiComplete'

export interface ACHScoreRequest {
  researchQuestion: string
  hypotheses: Array<{ id: string; text: string }>
  events: Array<{
    nodeId: string
    title: string
    summary?: string
    body?: string
    analystComments?: string[]
    category: string
    country: string
    severity: number
  }>
  apiKey?: string
}

export interface ACHScoreResponse {
  scores: ACHEventScore[]
  offline?: boolean
}

export async function POST(req: NextRequest) {
  const body: ACHScoreRequest = await req.json()
  const { researchQuestion, hypotheses, events } = body

  const plan = planAiFromRequestWithProvider(req, body.apiKey?.trim(), vaultGet, 'claude')

  if (hypotheses.length === 0 || events.length === 0) {
    return NextResponse.json({ scores: [] })
  }

  // Rules mode, or AI mode with no key available: score offline instead of
  // erroring. scoreACHOffline is a real fallback, so the canvas gets usable
  // scores rather than an "AI scoring unavailable" toast.
  if (plan.useOffline || plan.missingKeys || !plan.key) {
    return NextResponse.json<ACHScoreResponse>({
      scores: scoreACHOffline(hypotheses, events),
      offline: true,
    })
  }

  const hypoLines = hypotheses.map((h, i) => `H${i + 1} [id:${h.id}]: ${h.text}`).join('\n')
  const eventLines = events.map((e, i) => {
    const sev = e.severity >= 8 ? 'CRITICAL' : e.severity >= 6 ? 'HIGH' : e.severity >= 4 ? 'MEDIUM' : 'LOW'
    const lines = [`E${i + 1} [nodeId:${e.nodeId}]: [${sev}] ${e.title} (${e.country}, ${e.category})`]
    if (e.analystComments?.length) lines.push(`  Analyst: ${e.analystComments.join(' // ')}`)
    if ((e.body?.length ?? 0) > 300) {
      lines.push(`  Source text:\n${e.body!.trim().slice(0, 1400)}`)
    } else if (e.summary) {
      lines.push(`  Summary: ${e.summary.slice(0, 300)}`)
    }
    return lines.join('\n')
  }).join('\n\n')

  const prompt = `You are applying Richards Heuer's Analysis of Competing Hypotheses (ACH) to workspace evidence — not open-web knowledge.

RESEARCH QUESTION: "${researchQuestion}"

HYPOTHESES:
${hypoLines}

EVIDENCE (full source text when available):
${eventLines}

For every evidence item, rate its relationship to EACH hypothesis:
- "supports": this evidence increases the probability of this hypothesis
- "neutral": this evidence has no meaningful bearing on this hypothesis
- "contradicts": this evidence decreases the probability of this hypothesis

Heuer's key insight: focus on what CONTRADICTS hypotheses — inconsistency with the evidence is more diagnostic than consistency.

You must return one score object per evidence-hypothesis combination (${events.length} events × ${hypotheses.length} hypotheses = ${events.length * hypotheses.length} total objects).

Return ONLY valid JSON, no other text:
{
  "scores": [
    {
      "nodeId": "<exact nodeId from evidence>",
      "hypothesisId": "<exact id from hypothesis>",
      "rating": "supports" | "neutral" | "contradicts",
      "rationale": "One concise sentence explaining this rating."
    }
  ]
}`

  try {
    const completion = await runCompletion(plan, {
      system: ARGUS_INTEL_SYSTEM,
      prompt,
      maxTokens: 2500,
      jsonResponse: !plan.isAnthropic,
    })
    const result = parseModelJson<ACHScoreResponse>(completion.raw)
    return NextResponse.json(result)
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : 'ACH scoring failed' },
      { status: 500 }
    )
  }
}
