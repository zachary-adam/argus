import { NextRequest, NextResponse } from 'next/server'
import { vaultGet } from '@/lib/vault'
import { resolveMaxTokens, type EffortLevel } from '@/lib/aiConfig'
import { logAiUsage } from '@/lib/logAiUsage'
import { getRequestUserId } from '@/lib/auth/getRequestUser'
import { IntelEvent, CorrelationAlert, Plot, Situation } from '@/types'
import { targetingToPrompt } from '@/lib/targetingContext'
import { ARGUS_INTEL_SYSTEM } from '@/lib/workspaceIntel'
import { starterACHHypothesisTexts } from '@/lib/achTemplates'
import { parseModelJson } from '@/lib/parseModelJson'
import { planAiFromRequestWithProvider } from '@/lib/aiMode'
import { runCompletion } from '@/lib/aiComplete'
import type { BriefSource } from '@/types/brief'
import type { TrackedActor } from '@/types/project'
import { buildBriefEvidenceFromEvents, citedBriefSources } from '@/lib/briefSources'
import { actorBriefBlock, type ActorEvent } from '@/lib/actors'
import { threadBriefBlock, type ThreadEvent } from '@/lib/threads'
import { keyDatesBlock } from '@/lib/keyDates'
import { threatBand, THREAT_LABEL } from '@/lib/threatLevel'

interface PredictionEntry {
  formulaName: string; score: number; label: string
  inputs: Record<string, number>; weights: Record<string, number>
  narrative: string; timestamp: string
}

interface IncidentSummary {
  title: string; summary: string; stage: string; severity: string
  country: string; category: string; notes: string[]; linkedEventCount?: number; createdAt?: string
}

interface FlaggedAlert { title: string; severity: string; note: string; flaggedAt?: string }
interface ConnectorStatus { name: string; enabled: boolean; eventCount: number }

interface CaseSummary {
  name: string; researchQuestion?: string; status: string
  notes?: string; eventCount: number
}

interface ForecastSummary {
  claim: string; probability: number; dueDate?: string
  resolved?: boolean; outcome?: string
}

interface BriefRequest {
  projectName: string
  regionName: string
  goalTemplateId: string
  researchQuestion?: string
  events: IntelEvent[]
  alerts: CorrelationAlert[]
  situations?: Situation[]
  flaggedAlerts?: FlaggedAlert[]
  incidents?: IncidentSummary[]
  cases?: CaseSummary[]
  forecasts?: ForecastSummary[]
  predictionEntries?: PredictionEntry[]
  connectors?: ConnectorStatus[]
  plots?: Plot[]
  formulaResults?: { name: string; score: number; label: string }[]
  targeting?: import('@/types/project').Targeting
  workspaceContext?: string
  curatedEvidence?: string
  hypothesisTrail?: string
  forecastTrackRecord?: string
  trackedActors?: TrackedActor[]
  keyDates?: import('@/types/project').KeyDate[]
  apiKey?: string
}

const GOAL_CONTEXT: Record<string, string> = {
  'elections': 'electoral integrity, pre-election violence risk, and democratic process stability',
  'civil-unrest': 'civil unrest drivers, protest mobilization, and security force response patterns',
  'armed-conflict': 'active conflict dynamics, armed actor behavior, and escalation trajectories',
  'economic-crisis': 'economic shock indicators, debt distress, and financial stability risks',
  'political-stability': 'regime resilience, institutional fragility, and political succession risks',
  'humanitarian': 'humanitarian needs, displacement trends, and aid access constraints',
  'maritime-security': 'maritime chokepoint threats, sanctioned/dark-fleet activity, and naval posture',
  'counterterrorism': 'militant group activity, attack patterns, and territorial control',
  'cyber-threat': 'cyberattacks, critical-infrastructure intrusions, and state-linked operations',
  'border-migration': 'migration flows, border incidents, and displacement pressure',
  'supply-chain': 'trade disruption, commodity shocks, and logistics chokepoint risk',
  'public-health': 'disease outbreaks, health-system stress, and biosecurity signals',
  'information-ops': 'disinformation campaigns, narrative manipulation, and coordinated influence',
  'organized-crime': 'cartel/gang activity, trafficking routes, and illicit economies',
}

function buildSystemPrompt(goal: string, withBodyCount: number, plotCount = 0, workspaceContext?: string, actorCount = 0, hasThreads = false, hasCalendar = false, hasForecastRecord = false): string {
  const context = GOAL_CONTEXT[goal] ?? 'geopolitical risk and stability dynamics'
  const sourceNote = withBodyCount > 0
    ? `\n\nYou have been given ${withBodyCount} FULL SOURCE DOCUMENTS — complete article text from analyst-provided sources. These are your PRIMARY evidence. Read them closely and draw analysis from their specific content, quotes, and details. Cite sources by name/origin when drawing from them. Intelligence feed events (metadata-only) provide broader situational context.`
    : ''
  const plotNote = plotCount > 0
    ? `\n\nYou have ${plotCount} ANALYST WORKSPACE PLOTS — geographic markers, zones, and areas the analyst has placed on the map with labels, threat levels, and notes. Treat these as direct analyst intelligence: they indicate locations of concern, operational interest, or observed activity. Reference them in your key findings and patterns sections.`
    : ''
  const actorNote = actorCount > 0
    ? `\n\nTRACKED ACTOR DOSSIERS — the analyst has declared ${actorCount} actor${actorCount !== 1 ? 's' : ''} of interest. The dossier block gives DERIVED, deterministic stats (mention counts, 7-day trend, co-mentions) with the [E#] tags they trace to. Weave who-is-doing-what into keyFindings and patterns, citing those tags. Never assert actor activity beyond the cited events; a tracked actor with no corpus mentions is a collection gap — name it in intelligenceGaps.`
    : ''
  const threadNote = hasThreads
    ? `\n\nNARRATIVE THREADS — the thread block lists deterministic storylines (events linked by shared actors, related reporting, proximity) with their [E#] tags. Use threads as the situation's structure: an ACTIVE multi-outlet thread is a developing storyline worth a key finding; prefer thread-level assessments over isolated-event ones where a thread exists.`
    : ''
  const calendarNote = hasCalendar
    ? `\n\nSITUATION CALENDAR — the analyst has declared key dates for this watch. Anchor the outlook and any time-sensitive findings to them: reference how far the nearest upcoming date is and what typically shifts as it approaches. Do not invent dates beyond those given.`
    : ''
  const forecastNote = hasForecastRecord
    ? `\n\nFORECAST TRACK RECORD — a FORECAST TRACK RECORD block reports this analyst's measured calibration (Brier score, skill). Treat it as a credibility signal on probabilistic judgments: if calibration is good, state probabilities with appropriate confidence; if poor or unproven, hedge and note the limited track record in the methodology/assumptions.`
    : ''
  const analystNote = `\n\nANALYST INTELLIGENCE HIERARCHY: ⚑ Flagged alerts > Active incidents > Situation clusters > Investigation cases > Raw events. Flagged items and active incidents represent explicit analyst judgment — always reference them in key findings. Situation clusters show how events group thematically. Formula inputs reveal what variables drove the score.`
  return `${ARGUS_INTEL_SYSTEM}

Your analysis focuses on: ${context}${sourceNote}${plotNote}${actorNote}${threadNote}${calendarNote}${forecastNote}${analystNote}${workspaceContext ? `\n\n${workspaceContext}` : ''}

Write in the style of a classified intelligence product — precise, direct, evidence-based, no padding. Use analyst shorthand where appropriate. Never use hedging phrases like "it is important to note" or "it should be mentioned." Every sentence must carry analytical weight.

When event quality metadata is present: NATO reliability A-B = high credibility; D-F = caveat prominently. Confidence >80% = assess with confidence; <50% = hedge. Corroboration ≥3 = well-confirmed. ⚑ FLAGGED items = analyst-prioritized, reference in key findings. Named actors = identify who is responsible. Analyst notes = incorporate verbatim context into your assessment.

CITATIONS — every event below is tagged [E1], [E2], etc. Cite the tag(s) that support each claim, inline, immediately after the claim — e.g. "finding": "Polling-station clashes are intensifying in the north [E3][E7]". Put citations inside the bluf / situation / finding / significance / patterns / outlook text. Only cite tags that actually appear in the data — never invent one. An uncited assessment reads as unsupported.

CURATED EVIDENCE — when a CURATED RESEARCH LIBRARY block is present, entries are tagged [J1], [J2], etc. These are analyst-chosen saves (key/supporting/background). Prefer [J#] over [E#] when the same fact appears in both. Key-significance [J#] items are highest-priority analyst judgment — reference them in keyFindings before raw feed events.

HYPOTHESIS EVOLUTION — when present, anchor competingHypotheses to the CURRENT HYPOTHESIS and score seeds against cited [E#] and [J#] evidence.

This is a publishable-grade analytic product: every key finding carries explicit confidence, competing hypotheses keep it falsifiable, and assumptions/gaps state its limits. Use the SEED HYPOTHESES provided in the prompt as your starting set for competingHypotheses — refine their wording to the evidence and score each against the cited [E#] sources. Populate competingHypotheses, assumptions, and intelligenceGaps every time; they are core to the product, not optional.

Structure your response as valid JSON matching exactly this schema:
{
  "classification": "UNCLASSIFIED // FOR OFFICIAL USE ONLY",
  "bluf": "One sentence bottom line up front — the single most important analytical conclusion, with [E#] citation(s)",
  "situation": "2-3 sentences on the current situation in the region, cited",
  "keyFindings": [
    { "finding": "analytical finding with [E#] citation(s)", "significance": "why it matters", "confidence": "HIGH|MEDIUM|LOW" }
  ],
  "competingHypotheses": [
    { "hypothesis": "refined from the seed set", "likelihood": "IC probability phrase (almost certain / likely / roughly even / unlikely / remote)", "assessment": "which cited [E#] evidence supports or undercuts it", "citations": ["E#"] }
  ],
  "assumptions": ["key analytic assumptions the assessment rests on — 2-4 items"],
  "intelligenceGaps": ["specific unanswered questions / missing reporting and what to collect — 2-5 items"],
  "patterns": "1-2 sentences on identified patterns or correlations across events",
  "outlook": "1-2 sentences near-term outlook (30-90 day horizon)",
  "methodology": "1 sentence: evidence base and analytic technique this rests on (sources used, ACH, structural inference)",
  "analystNote": "One sentence on the most important caveat",
  "tags": ["tag1", "tag2"]
}

Return only the JSON object, no markdown, no preamble.`
}

function buildUserPrompt(req: BriefRequest): { prompt: string; sources: BriefSource[]; withBodyCount: number; actorCount: number; gradedShare: number; hasThreads: boolean; hasCalendar: boolean; hasForecastRecord: boolean } {
  const { corpus, sources, withBodyCount, ordered } = buildBriefEvidenceFromEvents(req.events, {
    maxRich: 10,
    maxMeta: 20,
  })
  const gradedShare = ordered.length
    ? ordered.filter(e => e.sourceReliability === 'A' || e.sourceReliability === 'B').length / ordered.length
    : 0

  const sections: string[] = []
  if (corpus && corpus !== 'No events in workspace.') {
    sections.push(`EVIDENCE CORPUS — cite as [E#]:\n\n${corpus}`)
  } else {
    sections.push('No events loaded — provide general regional assessment based on known conditions.')
  }

  // Deterministic actor dossiers + narrative threads, anchored to the SAME [E#]
  // order as the corpus above — the model reads derived structure it can cite,
  // never invents actor activity or storylines.
  const actorBlock = actorBriefBlock(req.trackedActors ?? [], ordered as unknown as ActorEvent[])
  if (actorBlock) sections.push(actorBlock)
  const threadBlock = threadBriefBlock(ordered as unknown as ThreadEvent[], req.trackedActors ?? [])
  if (threadBlock) sections.push(threadBlock)
  const calendarBlock = keyDatesBlock(req.keyDates)
  if (calendarBlock) sections.push(calendarBlock)
  if (req.forecastTrackRecord) sections.push(req.forecastTrackRecord)

  const alertsText = req.alerts.slice(0, 5).map(a =>
    `[${a.severity.toUpperCase()} ALERT] ${a.title} — ${a.summary} (${a.signalCount} signals: ${a.signals.slice(0, 2).join(' · ')})`
  ).join('\n')

  // Flagged alerts — analyst-prioritized, always surface first
  const flaggedText = req.flaggedAlerts?.length
    ? '\n⚑ ANALYST-FLAGGED ALERTS (' + req.flaggedAlerts.length + ' — treat as highest priority):\n' +
      req.flaggedAlerts.map(f => `- [${f.severity?.toUpperCase() ?? 'UNKNOWN'}] ${f.title}${f.note ? ` | Note: "${f.note}"` : ''}`).join('\n')
    : ''

  const casesText = req.cases?.length
    ? '\nINVESTIGATION CASES (' + req.cases.length + ' — analyst-tracked threads):\n' +
      req.cases.map(c =>
        `- [${c.status.toUpperCase()}] ${c.name} (${c.eventCount} events)` +
        (c.researchQuestion ? `\n  Question: ${c.researchQuestion}` : '') +
        (c.notes ? `\n  Notes: ${c.notes}` : '')
      ).join('\n\n')
    : ''

  const forecastsText = req.forecasts?.length
    ? '\nOPEN FORECASTS (' + req.forecasts.length + ' probabilistic claims):\n' +
      req.forecasts.map(f =>
        `- ${Math.round(f.probability * 100)}% — ${f.claim}` +
        (f.dueDate ? ` (due ${f.dueDate})` : '')
      ).join('\n')
    : ''

  // Active incidents — analyst synthesized narratives
  const incidentsText = req.incidents?.length
    ? '\nACTIVE INCIDENTS (' + req.incidents.length + ' — analyst-tracked situations):\n' +
      req.incidents.map(i =>
        `- [${i.severity.toUpperCase()} | ${i.stage.toUpperCase()}] ${i.title} — ${i.country} (${i.category})` +
        (i.summary ? `\n  Summary: ${i.summary}` : '') +
        (i.linkedEventCount ? `\n  Linked events: ${i.linkedEventCount}` : '') +
        (i.notes?.length ? `\n  Latest notes: ${i.notes.join(' // ')}` : '')
      ).join('\n\n')
    : ''

  // Situations — event clusters the system identified
  const situationsText = req.situations?.length
    ? '\nSITUATION CLUSTERS (' + req.situations.length + ' thematic groups):\n' +
      req.situations.slice(0, 5).map(s =>
        `- ${s.name} | ${s.countries.join(', ')} | ${s.eventCount} events (${s.criticalCount} crit, ${s.highCount} high) | Trend: ${s.trend}`
      ).join('\n')
    : ''

  // Formula entries with full inputs and weights
  const formulaText = req.predictionEntries?.length
    ? '\nFORMULA ANALYSIS (' + req.predictionEntries.length + ' runs):\n' +
      req.predictionEntries.map(e => {
        const inputLines = Object.entries(e.inputs).map(([k, v]) => `    ${k}: ${v} (weight: ${((e.weights[k] ?? 1) * 100).toFixed(0)}%)`).join('\n')
        return `${e.formulaName}: ${e.score}/100 (${e.label})\n  Inputs:\n${inputLines}\n  Assessment: ${e.narrative}`
      }).join('\n\n')
    : (req.formulaResults?.length
      ? '\nFORMULA RESULTS:\n' + req.formulaResults.map(f => `${f.name}: ${f.score}/100 (${f.label})`).join('\n')
      : '')

  // Connectors — data source health
  const connectorsText = req.connectors?.length
    ? '\nDATA SOURCES: ' + req.connectors.map(c => `${c.name} ${c.enabled ? `✓(${c.eventCount} events)` : '✗ disabled'}`).join(' | ')
    : ''

  const plotsText = req.plots?.length
    ? '\nANALYST WORKSPACE PLOTS (' + req.plots.length + ' total):\n' +
      req.plots.map(p => {
        const loc = p.type === 'point' && Array.isArray(p.coordinates) && typeof p.coordinates[0] === 'number'
          ? `lat ${(p.coordinates as number[])[1].toFixed(3)}, lon ${(p.coordinates as number[])[0].toFixed(3)}`
          : p.type
        return `- [${(p.properties?.threat_level ?? 'info').toUpperCase()}] ${p.label ?? 'Unnamed'} (${p.type} @ ${loc})` +
          (p.properties?.category ? ` | ${p.properties.category}` : '') +
          (p.properties?.notes ? `: ${p.properties.notes}` : '')
      }).join('\n')
    : ''

  const divider = '─'.repeat(60)

  const targetingBlock = targetingToPrompt(req.targeting)

  const rqLine = req.researchQuestion
    ? `RESEARCH QUESTION: ${req.researchQuestion}\n`
    : ''

  // Seed three competing hypotheses from the project's goal template so the ACH
  // section is anchored to the analytical frame rather than invented from scratch.
  const seedHypotheses = starterACHHypothesisTexts({
    goalTemplateId: req.goalTemplateId,
    researchQuestion: req.researchQuestion,
  })
  const seedBlock = `SEED HYPOTHESES (refine to the evidence, then score each in competingHypotheses):\n${seedHypotheses.map((h, i) => `H${i + 1}. ${h}`).join('\n')}`

  const hypothesisSection = req.hypothesisTrail
    ? `${divider}\n\n${req.hypothesisTrail}`
    : ''

  const curatedSection = req.curatedEvidence
    ? `${divider}\n\n${req.curatedEvidence}`
    : ''

  const prompt = `PROJECT: ${req.projectName}
REGION: ${req.regionName}
ANALYTICAL FOCUS: ${GOAL_CONTEXT[req.goalTemplateId] ?? req.goalTemplateId}
${rqLine}${targetingBlock ? targetingBlock + '\n' : ''}EVENT COUNT: ${req.events.length} | SOURCE DOCS: ${withBodyCount} | CASES: ${req.cases?.length ?? 0} | INCIDENTS: ${req.incidents?.length ?? 0} | PLOTS: ${req.plots?.length ?? 0}
${connectorsText}${flaggedText}${casesText}${incidentsText}${situationsText}${formulaText}${forecastsText}${plotsText}

${seedBlock}${hypothesisSection}${curatedSection}

${divider}

${sections.join('\n\n' + divider + '\n\n')}

${req.alerts.length > 0 ? `${divider}\n\nCORRELATION ALERTS (${req.alerts.length}):\n${alertsText}` : ''}

Produce the intelligence brief now.`

  return { prompt, sources, withBodyCount, actorCount: req.trackedActors?.length ?? 0, gradedShare, hasThreads: !!threadBlock, hasCalendar: !!calendarBlock, hasForecastRecord: !!req.forecastTrackRecord }
}

// Template-mode fallback when no API key
function generateTemplate(req: BriefRequest): object {
  const criticalCount = req.events.filter(e => e.severity === 'critical').length
  const highCount = req.events.filter(e => e.severity === 'high').length
  const countries = [...new Set(req.events.map(e => e.country))].slice(0, 4).join(', ')
  const topEvent = req.events.find(e => e.severity === 'critical') ?? req.events[0]

  // Shared count-based banding — keeps the template consistent with the home board.
  const threatLevel = THREAT_LABEL[threatBand(criticalCount, highCount)]

  return {
    classification: 'UNCLASSIFIED // FOR OFFICIAL USE ONLY',
    bluf: topEvent
      ? `${req.regionName} presents ${threatLevel} risk conditions with ${criticalCount} critical-severity events detected across ${req.events.length} total intelligence items in the monitoring window.`
      : `Insufficient event data for ${req.regionName} — expand data sources and re-run briefing.`,
    situation: `ARGUS has ingested ${req.events.length} events for the ${req.regionName} region. ${criticalCount} critical and ${highCount} high-severity events are active. Primary reporting originates from ${countries || 'the region'}.`,
    keyFindings: req.events.slice(0, 4).map(e => ({
      finding: e.title,
      significance: e.summary,
      confidence: e.severity === 'critical' ? 'HIGH' : e.severity === 'high' ? 'MEDIUM' : 'LOW',
    })),
    competingHypotheses: starterACHHypothesisTexts({
      goalTemplateId: req.goalTemplateId,
      researchQuestion: req.researchQuestion,
    }).slice(0, 3).map(h => ({
      hypothesis: h,
      likelihood: 'roughly even chance',
      assessment: 'Template fallback — add AI keys for evidence-scored hypotheses.',
      citations: [],
    })),
    assumptions: ['Open-source reporting only', 'Event sample may not represent full theater'],
    intelligenceGaps: ['Add ACLED or bilateral sources for structured conflict data', 'Complete ACH matrix on canvas before publishing'],
    patterns: req.alerts.length > 0
      ? `Correlation engine identified ${req.alerts.length} pattern alert${req.alerts.length > 1 ? 's' : ''}. ${req.alerts[0]?.summary ?? ''}`
      : 'No significant cross-event patterns detected in current monitoring window. Expand time horizon or add data sources.',
    outlook: `Near-term trajectory in ${req.regionName} is ${threatLevel === 'CRITICAL' ? 'deteriorating' : threatLevel === 'ELEVATED' ? 'uncertain with escalation potential' : 'stable with isolated risk pockets'}. Continue monitoring high-severity indicators.`,
    analystNote: '[TEMPLATE] Auto-generated from open-source counts — add AI keys in Settings for evidence-scored analysis.',
    tags: [req.regionName, req.goalTemplateId, threatLevel],
  }
}

export async function POST(req: NextRequest) {
  try {
    const body: BriefRequest = await req.json()
    const effort = (req.headers.get('x-effort') ?? 'medium') as EffortLevel
    const plan = planAiFromRequestWithProvider(req, body.apiKey?.trim(), vaultGet, 'claude')

    if (plan.useOffline || plan.missingKeys || !plan.key) {
      return NextResponse.json({
        brief: generateTemplate(body),
        mode: 'template',
        offline: true,
        ...(plan.useOffline
          ? {}
          : { warning: 'No AI key available — rules-based brief used instead.' }),
      })
    }

    // Build the corpus first so the system prompt advertises the number of full
    // documents ACTUALLY included (capped at maxRich), not the uncapped total —
    // otherwise the model is told it has more source text than it received.
    const { prompt: userPrompt, sources, withBodyCount, actorCount, gradedShare, hasThreads, hasCalendar, hasForecastRecord } = buildUserPrompt(body)
    const plotCount = body.plots?.length ?? 0
    const sysPrompt  = buildSystemPrompt(body.goalTemplateId, withBodyCount, plotCount, body.workspaceContext, actorCount, hasThreads, hasCalendar, hasForecastRecord)

    let content = ''
    let generation: import('@/types/brief').BriefGenerationMeta | null = null
    const t0 = Date.now()
    const userIdPromise = getRequestUserId()

    try {
      const completion = await runCompletion(plan, {
        system: sysPrompt,
        prompt: userPrompt,
        maxTokens: resolveMaxTokens(effort, 3000),
        effort,
        temperature: 0.3,
        jsonResponse: !plan.isAnthropic,
        timeoutMs: 90_000,
      })
      content = completion.raw
      // Deterministic methodology appendix — a record of what ACTUALLY went in,
      // built from the request, never model-written.
      generation = {
        generatedAt: new Date().toISOString(),
        provider: completion.provider,
        model: completion.model,
        effort,
        eventCount: body.events.length,
        citedCorpusSize: sources.length,
        fullTextDocs: withBodyCount,
        gradedShare: Math.round(gradedShare * 100) / 100,
        trackedActorCount: actorCount,
        curatedEntries: new Set(body.curatedEvidence?.match(/\[J\d+\]/g) ?? []).size,
      }

      const userId = await userIdPromise.catch(() => null)
      logAiUsage({
        feature: 'brief_project', provider: completion.provider,
        model: completion.model,
        effort, input_tokens: completion.inputTokens, output_tokens: completion.outputTokens,
        duration_ms: Date.now() - t0,
        context: body.regionName ?? body.projectName,
        project_id: (body as { projectId?: string }).projectId,
        user_id: userId ?? undefined,
      }).catch(() => {})
    } catch (err) {
      console.error('[brief/project] AI error:', err)
      return NextResponse.json({ brief: generateTemplate(body), mode: 'template', warning: 'AI unavailable — template used' })
    }

    let brief: Record<string, unknown>
    try {
      brief = parseModelJson<Record<string, unknown>>(content)
    } catch (parseErr) {
      console.error('[brief/project] JSON parse failed:', parseErr)
      return NextResponse.json({
        brief: generateTemplate(body),
        mode: 'template',
        warning: 'AI response was not valid JSON — template used',
      })
    }

    const cited = citedBriefSources(sources, content)
    brief.sources = cited
    if (generation) brief.generation = generation

    return NextResponse.json({ brief, mode: 'ai' })
  } catch (err) {
    console.error('[brief/project]', err)
    return NextResponse.json({ error: 'Briefing failed' }, { status: 500 })
  }
}
