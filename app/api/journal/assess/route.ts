import { NextRequest, NextResponse } from 'next/server'
import type { IntelEvent } from '@/types'
import type { JournalEntry, JournalSignificance } from '@/types/project'
import { decideRelevance, eventEmbedText } from '@/lib/semanticRelevance'
import { checkRateLimit, getClientIp } from '@/lib/rateLimit'
import { vaultGet } from '@/lib/vault'
import { planAiFromRequestWithProvider } from '@/lib/aiMode'
import { runCompletion } from '@/lib/aiComplete'

interface AssessRequest {
  entry: Pick<
    JournalEntry,
    'id' | 'kind' | 'title' | 'summary' | 'note' | 'body' | 'abstract' | 'country' | 'countryCode' | 'category' | 'significance'
  >
  researchQuestion?: string
  hypothesis?: string
  targeting?: import('@/types/project').Targeting
  countryCodes?: string[]
  apiKey?: string
}

interface AssessResponse {
  score: number
  suggestedSignificance: JournalSignificance
  missionFit: 'central' | 'relevant' | 'tangential'
  hypothesisRelation?: 'supports' | 'undercuts' | 'neutral'
  summary: string
  embedPreview: string
  aiEnhanced?: boolean
}

function scoreToSignificance(score: number): JournalSignificance {
  if (score >= 68) return 'key'
  if (score >= 42) return 'supporting'
  return 'background'
}

function scoreToMissionFit(score: number): AssessResponse['missionFit'] {
  if (score >= 68) return 'central'
  if (score >= 42) return 'relevant'
  return 'tangential'
}

function entryAsEvent(entry: AssessRequest['entry']): IntelEvent {
  return {
    id: entry.id,
    title: entry.title,
    summary: entry.summary ?? entry.note ?? '',
    body: entry.body ?? entry.abstract ?? entry.note,
    country: entry.country ?? '',
    countryCode: entry.countryCode ?? '',
    category: (entry.category ?? 'political') as IntelEvent['category'],
    severity: 'medium',
    lat: 0,
    lon: 0,
    source: 'analyst',
    url: '',
    timestamp: new Date().toISOString(),
  }
}

function entryText(entry: AssessRequest['entry']): string {
  return [
    entry.title,
    entry.summary,
    entry.note,
    entry.body,
    entry.abstract,
    entry.country,
  ].filter(Boolean).join('\n')
}

function keywordHypothesisRelation(
  hypothesis: string | undefined,
  note: string | undefined,
): AssessResponse['hypothesisRelation'] | undefined {
  if (!hypothesis?.trim() || !note?.trim()) return undefined
  const noteLower = note.toLowerCase()
  if (noteLower.includes('contradict') || noteLower.includes('undercut') || noteLower.includes('unlikely')) {
    return 'undercuts'
  }
  if (noteLower.includes('support') || noteLower.includes('confirm') || noteLower.includes('evidence for')) {
    return 'supports'
  }
  return 'neutral'
}

function parseAiAssess(raw: string): Partial<AssessResponse> | null {
  try {
    const parsed = JSON.parse(raw) as Partial<AssessResponse>
    const score = typeof parsed.score === 'number' ? Math.max(0, Math.min(100, Math.round(parsed.score))) : undefined
    const sig = parsed.suggestedSignificance
    const validSig = sig === 'key' || sig === 'supporting' || sig === 'background' ? sig : undefined
    const fit = parsed.missionFit
    const validFit = fit === 'central' || fit === 'relevant' || fit === 'tangential' ? fit : undefined
    const rel = parsed.hypothesisRelation
    const validRel = rel === 'supports' || rel === 'undercuts' || rel === 'neutral' ? rel : undefined
    if (score == null || !validSig || !validFit || !parsed.summary?.trim()) return null
    return {
      score,
      suggestedSignificance: validSig,
      missionFit: validFit,
      hypothesisRelation: validRel,
      summary: parsed.summary.trim(),
    }
  } catch {
    return null
  }
}

async function aiAssessEntry(
  req: NextRequest,
  body: AssessRequest,
  baselineScore: number,
): Promise<Partial<AssessResponse> | null> {
  const plan = planAiFromRequestWithProvider(req, body.apiKey, vaultGet, 'claude')
  if (plan.useOffline || plan.missingKeys || !plan.key) return null

  const mission = body.researchQuestion?.trim() || 'General regional intelligence monitoring'
  const hypothesis = body.hypothesis?.trim()
  const keywords = body.targeting?.keywords?.slice(0, 8).join(', ') || '—'
  const entities = body.targeting?.watchEntities?.slice(0, 6).join(', ') || '—'
  const countries = (body.countryCodes ?? []).slice(0, 6).join(', ') || '—'

  const userPrompt = `Mission research question: ${mission}
Watch entities: ${entities}
Keywords: ${keywords}
Country focus: ${countries}
${hypothesis ? `Current working hypothesis: ${hypothesis}` : 'No hypothesis recorded yet.'}
Semantic baseline score: ${baselineScore}/100

Library entry (${body.entry.kind}):
Title: ${body.entry.title}
${entryText(body.entry).slice(0, 2500)}

Assess mission relevance. Return JSON only:
{"score":0-100,"suggestedSignificance":"key"|"supporting"|"background","missionFit":"central"|"relevant"|"tangential","hypothesisRelation":"supports"|"undercuts"|"neutral"|null,"summary":"2-3 sentences for the analyst"}`

  const system = 'You are an intelligence analyst assistant scoring curated research library entries against a mission frame. Be concise and conservative — background items are common.'

  try {
    const { raw } = await runCompletion(plan, {
      system,
      prompt: userPrompt,
      maxTokens: 400,
      effort: 'low',
      timeoutMs: 20_000,
      jsonResponse: true,
    })
    return parseAiAssess(raw)
  } catch {
    return null
  }
}

export async function POST(req: NextRequest) {
  if (!checkRateLimit(`journal-assess:${getClientIp(req)}`, 24, 60_000)) {
    return NextResponse.json({ error: 'Too many requests' }, { status: 429 })
  }

  try {
    const body = (await req.json()) as AssessRequest
    const entry = body.entry
    if (!entry?.title?.trim()) {
      return NextResponse.json({ error: 'entry required' }, { status: 400 })
    }

    const pseudo = entryAsEvent(entry)
    const decision = await decideRelevance([pseudo], {
      targeting: body.targeting,
      countryCodes: body.countryCodes,
      researchQuestion: body.researchQuestion,
    })

    const row = decision.results.find(r => r.id === entry.id)
    const baselineScore = row?.score ?? 0

    let score = baselineScore
    let suggestedSignificance = scoreToSignificance(baselineScore)
    let missionFit = scoreToMissionFit(baselineScore)
    let hypothesisRelation = keywordHypothesisRelation(body.hypothesis, entry.note)
    let summaryParts = [
      `Mission relevance score: ${baselineScore}/100 (${missionFit}).`,
      `Suggested significance: ${suggestedSignificance}.`,
    ]
    if (body.researchQuestion?.trim()) {
      summaryParts.push(`Scored against: "${body.researchQuestion.trim().slice(0, 120)}${body.researchQuestion.length > 120 ? '…' : ''}"`)
    }
    if (hypothesisRelation) {
      summaryParts.push(`Analyst note vs current hypothesis: ${hypothesisRelation}.`)
    }
    if (!decision.applied) {
      summaryParts.push('Semantic scoring unavailable — keyword fallback only.')
    }

    let aiEnhanced = false
    const aiMode = req.headers.get('x-argus-ai-mode')
    if (aiMode !== 'none') {
      const ai = await aiAssessEntry(req, body, baselineScore)
      if (ai?.score != null) {
        aiEnhanced = true
        score = ai.score
        suggestedSignificance = ai.suggestedSignificance ?? suggestedSignificance
        missionFit = ai.missionFit ?? missionFit
        hypothesisRelation = ai.hypothesisRelation ?? hypothesisRelation
        summaryParts = [ai.summary ?? summaryParts.join(' ')]
        if (decision.applied) {
          summaryParts.push(`(Semantic baseline ${baselineScore}/100.)`)
        }
      }
    }

    const response: AssessResponse = {
      score,
      suggestedSignificance,
      missionFit,
      hypothesisRelation,
      summary: summaryParts.join(' '),
      embedPreview: eventEmbedText(pseudo).slice(0, 200),
      aiEnhanced,
    }

    return NextResponse.json(response)
  } catch (err) {
    console.error('[journal/assess]', err)
    return NextResponse.json({ error: 'Assessment failed' }, { status: 500 })
  }
}
