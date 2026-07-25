import { NextRequest } from 'next/server'
import { fetchWikipediaContext } from '@/lib/wikipediaRAG'
import { ARGUS_INTEL_SYSTEM } from '@/lib/workspaceIntel'
import { IntelEvent, CorrelationAlert, Plot, VesselPosition, AircraftPosition } from '@/types'
import { haversineDistance } from '@/lib/haversine'
import { vaultGet } from '@/lib/vault'
import { logAiUsage } from '@/lib/logAiUsage'
import { getRequestUserId } from '@/lib/auth/getRequestUser'
import { parseModelJson } from '@/lib/parseModelJson'
import { AI_KEYS_MISSING_BODY, planAiFromRequestWithProvider } from '@/lib/aiMode'
import { runStreamCompletion } from '@/lib/aiComplete'
import { buildBriefEvidenceFromEvents, citedBriefSources } from '@/lib/briefSources'
import { generateCountryBriefTemplate } from '@/lib/countryBriefTemplate'

// Maritime-biased anchor points per country — biased toward coastal/strategic zones
// Multiple anchors for countries with large maritime areas
const COUNTRY_ANCHORS: Record<string, { lat: number; lon: number }[]> = {
  IR: [{ lat: 26.5, lon: 56.5 }, { lat: 27.0, lon: 52.0 }, { lat: 32.4, lon: 53.7 }], // Hormuz + Persian Gulf + Tehran
  IQ: [{ lat: 29.5, lon: 48.5 }, { lat: 33.2, lon: 43.7 }],                            // Shatt al-Arab + Baghdad
  SA: [{ lat: 26.5, lon: 56.5 }, { lat: 23.9, lon: 45.1 }, { lat: 21.5, lon: 38.5 }], // Hormuz + Riyadh + Red Sea
  YE: [{ lat: 12.5, lon: 43.5 }, { lat: 15.6, lon: 48.5 }],                            // Bab-el-Mandeb + Sanaa
  SY: [{ lat: 35.5, lon: 35.8 }, { lat: 34.8, lon: 38.9 }],                            // Syrian coast + inland
  LB: [{ lat: 33.9, lon: 35.5 }],
  IL: [{ lat: 31.5, lon: 34.5 }, { lat: 29.5, lon: 34.9 }],                            // Med coast + Eilat/Red Sea
  UA: [{ lat: 46.5, lon: 31.5 }, { lat: 48.4, lon: 31.2 }],                            // Black Sea coast + Kyiv
  RU: [{ lat: 44.0, lon: 39.0 }, { lat: 61.5, lon: 90.0 }, { lat: 69.0, lon: 33.0 }], // Black Sea + Siberia + Arctic
  CN: [{ lat: 23.0, lon: 120.0 }, { lat: 25.0, lon: 122.0 }, { lat: 35.9, lon: 104.2 }], // South China Sea + Taiwan Strait + inland
  TW: [{ lat: 23.7, lon: 121.0 }, { lat: 25.0, lon: 122.0 }],                          // Taiwan + strait
  KP: [{ lat: 40.3, lon: 127.5 }, { lat: 38.5, lon: 128.5 }],
  KR: [{ lat: 34.9, lon: 128.6 }, { lat: 36.5, lon: 127.9 }],                          // Korea Strait + Seoul
  JP: [{ lat: 34.0, lon: 136.0 }, { lat: 36.2, lon: 138.3 }],                          // Pacific coast + Tokyo
  PK: [{ lat: 24.5, lon: 62.5 }, { lat: 30.4, lon: 69.3 }],                            // Arabian Sea coast + inland
  IN: [{ lat: 15.0, lon: 74.0 }, { lat: 20.6, lon: 79.0 }, { lat: 8.5, lon: 77.0 }],  // West coast + inland + south
  SO: [{ lat: 11.5, lon: 51.0 }, { lat: 5.2, lon: 46.2 }],                             // Gulf of Aden coast + Mogadishu
  ET: [{ lat: 12.5, lon: 43.5 }, { lat: 9.1, lon: 40.5 }],                             // Djibouti/Red Sea + Addis
  SD: [{ lat: 19.5, lon: 37.5 }, { lat: 12.9, lon: 30.2 }],                            // Red Sea coast + Khartoum
  LY: [{ lat: 32.5, lon: 15.0 }, { lat: 26.3, lon: 17.2 }],                            // Med coast + inland
  EG: [{ lat: 30.5, lon: 32.3 }, { lat: 29.5, lon: 34.0 }, { lat: 26.8, lon: 30.8 }], // Suez + Red Sea + Cairo
  TR: [{ lat: 41.0, lon: 29.0 }, { lat: 40.5, lon: 28.5 }, { lat: 36.8, lon: 34.6 }], // Bosphorus + Istanbul + Med
  GR: [{ lat: 37.5, lon: 23.7 }, { lat: 39.1, lon: 22.0 }],
  MY: [{ lat: 2.5, lon: 101.5 }, { lat: 4.2, lon: 108.0 }],                            // Malacca + East Malaysia
  MM: [{ lat: 15.0, lon: 97.0 }, { lat: 17.1, lon: 96.9 }],
  VN: [{ lat: 16.0, lon: 112.0 }, { lat: 14.1, lon: 108.3 }],                          // South China Sea + coast
  PH: [{ lat: 12.9, lon: 121.8 }, { lat: 10.0, lon: 118.5 }],
}

interface BriefRequest {
  country: string
  countryCode: string
  recentEvents?: IntelEvent[]
  correlationAlerts?: CorrelationAlert[]
  plots?: Plot[]
  projectName?: string
  projectRegion?: string
  projectGoal?: string
  researchQuestion?: string
  workspaceContext?: string
  apiKey?: string
}

export async function POST(req: NextRequest) {
  const body: BriefRequest = await req.json()
  const { country, countryCode, recentEvents = [], correlationAlerts = [], plots = [], projectName, projectRegion, projectGoal, researchQuestion, workspaceContext, apiKey: clientKey } = body

  // Pull live maritime/aviation data from server-side singletons
  const allVessels: VesselPosition[] = typeof globalThis.__aisstream !== 'undefined'
    ? Array.from(globalThis.__aisstream.vesselStore.values()) : []
  const { getCache } = await import('@/lib/cache')
  const allAircraft: AircraftPosition[] = getCache('aviation') as AircraftPosition[] ?? []

  // Filter using multiple maritime-biased anchors — vessel is nearby if within 1000km of ANY anchor
  const anchors = COUNTRY_ANCHORS[countryCode] ?? []
  const isNearCountry = (lat: number, lon: number) =>
    anchors.length === 0 ? false :
    anchors.some(a => haversineDistance(lat, lon, a.lat, a.lon) < 1000)

  const nearbyVessels = allVessels.filter(v => isNearCountry(v.lat, v.lon))
  const nearbyAircraft = allAircraft.filter(a => isNearCountry(a.latitude, a.longitude))

  const sanctionedVessels = nearbyVessels.filter(v => v.sanctioned)
  const milAircraft = nearbyAircraft.filter(a => a.type === 'military')
  const cargoAircraft = nearbyAircraft.filter(a => a.type === 'cargo')

  const [wikiContext, profileRes] = await Promise.all([
    fetchWikipediaContext(country),
    fetch(new URL(`/api/country/${countryCode}`, req.nextUrl.origin).toString())
      .then(r => r.json()).catch(() => null),
  ])

  const profile = profileRes
  const aiPlots = plots.filter(p => p.properties?.ai_include !== false)
  const criticalPlots = aiPlots.filter(p => p.properties?.threat_level === 'critical' || p.properties?.threat_level === 'high')

  const projectCtx = [
    projectName   && `Project: "${projectName}"`,
    projectRegion && `Geographic focus: ${projectRegion}`,
    projectGoal   && `Analysis goal: ${projectGoal.replace(/-/g, ' ')}`,
    researchQuestion && `Research question: ${researchQuestion}`,
  ].filter(Boolean).join(' · ')

  // ── Shared [E#] citation index via formatTaggedEventCorpus
  const { corpus: eventCorpus, sources, withBodyCount } = buildBriefEvidenceFromEvents(recentEvents, {
    maxRich: 20,
    maxMeta: 14,
  })

  const sourceDocNote = withBodyCount > 0
    ? ` You have been given ${withBodyCount} FULL SOURCE DOCUMENTS — complete article text. These are your PRIMARY evidence: read them closely, paraphrase specific content, and cite the [E#] tag inline for every claim drawn from them. Metadata-only feed events are secondary context.`
    : ''

  // Seed three competing hypotheses from the project's goal template so the ACH
  // section is anchored to the analytical frame rather than invented from scratch.
  const { starterACHHypothesisTexts } = await import('@/lib/achTemplates')
  const seedHypotheses = starterACHHypothesisTexts({ goalTemplateId: projectGoal, researchQuestion })

  const systemPrompt = `${ARGUS_INTEL_SYSTEM}

You are producing a publishable-grade, country-specific intelligence assessment — written to the standard of a peer-reviewable analytic paper: rigorous structure, explicit reasoning, full source attribution, and stated limitations.${projectCtx ? `\n\nCONTEXT: ${projectCtx}. Scope your analysis to this project frame — treat events outside it as peripheral unless they directly affect ${country}.` : ''}${sourceDocNote}${workspaceContext ? `\n\n${workspaceContext}` : ''}

Use formal IC-style language and IC probability terms: almost certain (>95%), likely (70-95%), roughly even chance (40-60%), unlikely (5-30%), remote (<5%).

CITATIONS — MANDATORY, this is what makes the assessment logical rather than asserted:
- Every event in the EVIDENCE block below is tagged [E1], [E2], … . Cite the supporting tag(s) inline, immediately after each factual claim — e.g. "Patrol clashes have recurred along the eastern sector [E3][E7]."
- Put [E#] citations inside executiveSummary, situationAssessment, every keyJudgment, every riskFactor detail, economicExposure, and the outlooks. An uncited factual claim reads as unsupported and is a defect.
- ONLY cite tags that actually appear in the evidence. Never invent a tag. If no source supports a statement, either drop the statement or label it explicitly as an analytic inference or background context — not reporting.

DEPTH + HONESTY (both are required — they are not in tension):
- ALWAYS produce the full, richly-structured product below, regardless of how thin the reporting is. Thin evidence is never an excuse for a thin brief — it is a reason to lead with what is missing, reason carefully from the country profile and structural background, and lay out competing hypotheses for what may be developing.
- Cleanly separate three registers: (a) CURRENT REPORTING — only what the cited [E#] sources support; (b) STRUCTURAL/BACKGROUND assessment — drawn from the country profile and durable context, labeled as such, never dressed up as fresh reporting; (c) INFERENCE — your analytic reasoning, flagged as judgment. Do NOT introduce specific current-situation facts (battles, casualties, named operations, troop movements, dates) that no cited source supports.
- confidenceLevel and each keyJudgment.confidence MUST track the evidence, not prose polish:
  • LOW — fewer than ~3 on-topic cited sources, single-source, tangential coverage, or no direct reporting. Default when reporting is thin. A LOW-confidence brief can still be long, structured and valuable — it just foregrounds gaps and hypotheses.
  • MODERATE — several on-topic sources, limited corroboration or full text.
  • HIGH — only when multiple corroborated, on-topic, full-text sources directly support the judgment.
  Justify the level by the actual cited evidence; never claim "corroborated reports" unless corroboration is present in the inputs.
- Populate competingHypotheses, assumptions, and intelligenceGaps every time — these are core to the product, not optional extras. Use the SEED HYPOTHESES provided as your starting set, refining their wording to the evidence and scoring each against it.

When quality metadata is present: NATO reliability A-B = high credibility; D-F = caveat explicitly. Confidence >80% = assess with confidence; <50% = hedge. Corroboration ≥3 = well-confirmed. ⚑ FLAGGED = analyst-prioritized, reference prominently. Named actors = identify. Analyst notes = always incorporate. Return ONLY valid JSON.`

  // Concrete evidence-base signal so confidence is calibrated to inputs, not prose.
  // "On-topic" = the source text actually mentions the target country (rough proxy
  // for relevance — a feed full of articles that never name the country is thin).
  const onTopicCount = recentEvents.filter(e => {
    const hay = `${e.title} ${e.summary ?? ''} ${(e as any).body ?? ''} ${e.country ?? ''}`.toLowerCase()
    return !!country && hay.includes(country.toLowerCase())
  }).length
  const fullTextCount = withBodyCount
  const evidenceBase = `EVIDENCE BASE (calibrate confidenceLevel and every keyJudgment.confidence to this — do not exceed what it supports):
- Total events supplied: ${recentEvents.length}
- Directly on-topic (mention ${country || 'the country'}): ${onTopicCount}
- With full article text: ${fullTextCount}
- Correlation alerts: ${correlationAlerts.length}
${recentEvents.length === 0
  ? '- NOTE: No event reporting supplied. Build a full STRUCTURAL assessment from the country profile + background, set confidenceLevel LOW, and make intelligenceGaps and competingHypotheses do the analytical work.'
  : onTopicCount < 3
    ? '- NOTE: Thin/tangential on-topic coverage. Treat the current-situation picture as an intelligence gap and set confidenceLevel LOW — but still deliver the full structured product: ground the situation assessment in the country profile (labeled as structural/background), lead with the gap, and lay out competing hypotheses for what may be developing. Do NOT fabricate current events to fill the void.'
    : '- NOTE: On-topic coverage is sufficient to assess the current situation directly. Cite [E#] tags throughout and let corroboration drive confidence.'}`

  const seedHypothesesBlock = `SEED HYPOTHESES (refine wording to the evidence, then score each in competingHypotheses):
${seedHypotheses.map((h, i) => `H${i + 1}. ${h}`).join('\n')}`

  const userPrompt = `Generate a comprehensive, publishable-grade intelligence assessment for: ${country} (${countryCode})

${evidenceBase}

${seedHypothesesBlock}

COUNTRY PROFILE:
${profile ? JSON.stringify({
  riskScore: profile.riskScore,
  gdp: profile.gdp,
  gdpGrowth: profile.gdpGrowth,
  inflation: profile.inflation,
  freedomScore: profile.freedomScore,
  fragilityScore: profile.fragilityScore,
  population: profile.population,
}, null, 2) : 'Unavailable'}

${eventCorpus || 'RECENT INTELLIGENCE: None loaded — no [E#] sources available; build the assessment from the country profile + background and say so in intelligenceGaps.'}

ACTIVE CORRELATION ALERTS:
${correlationAlerts.slice(0, 5).map(a => `- [${a.severity.toUpperCase()}] ${a.title}: ${a.summary} (${a.signalCount} signals: ${a.signals.slice(0, 2).join(' · ')})`).join('\n') || 'None'}

LIVE MARITIME PICTURE (regional):
${nearbyVessels.length > 0
  ? `${nearbyVessels.length} vessels tracked | Sanctioned: ${sanctionedVessels.length} | Military: ${nearbyVessels.filter(v => v.ship_type === 'Military').length} | Tankers: ${nearbyVessels.filter(v => v.ship_type === 'Tanker').length} | Cargo: ${nearbyVessels.filter(v => v.ship_type === 'Cargo').length}
${sanctionedVessels.length > 0 ? `SANCTIONED: ${sanctionedVessels.slice(0, 3).map(v => `${v.name} (${v.flag}, MMSI ${v.mmsi})`).join('; ')}` : 'No sanctioned vessels detected'}`
  : 'No AIS vessel data available for this region'}

LIVE AVIATION PICTURE (regional):
${nearbyAircraft.length > 0
  ? `${nearbyAircraft.length} aircraft tracked | Military: ${milAircraft.length} | Cargo/airlift: ${cargoAircraft.length} | Civil: ${nearbyAircraft.length - milAircraft.length - cargoAircraft.length}
${milAircraft.length > 0 ? `MILITARY: ${milAircraft.slice(0, 4).map(a => `${a.callsign || a.icao24} (${a.origin_country}) @ ${Math.round(a.baro_altitude)}m`).join('; ')}` : 'No military aircraft detected'}`
  : 'No aviation data available for this region'}

WIKIPEDIA CONTEXT (structural/background — label as such, do not present as current reporting):
${wikiContext.slice(0, 3500)}

${aiPlots.length > 0 ? `ANALYST WORKSPACE PLOTS — AI-included (${aiPlots.length} total, ${criticalPlots.length} high-priority):
${aiPlots.slice(0, 10).map(p => {
  const conf = p.properties?.confidence ? ` | ${p.properties.confidence.toUpperCase()}` : ''
  const header = `- [${(p.properties?.threat_level ?? 'info').toUpperCase()}] ${p.label ?? 'Unnamed'} (${p.type}${p.properties?.category ? ` · ${p.properties.category}` : ''})${conf}`
  const notes = p.properties?.notes ? `\n  ${p.properties.notes.replace(/\n/g, '\n  ')}` : ''
  return header + notes
}).join('\n')}` : ''}

Return this exact JSON (every prose field must carry inline [E#] citations wherever it states reported facts):
{
  "executiveSummary": "3-4 sentence BLUF — the single most important strategic conclusion and its key risk drivers, with [E#] citations",
  "situationAssessment": "2-3 paragraph current situation analysis. Lead with cited current reporting; where reporting is thin, pivot explicitly to structural/background assessment and say so",
  "keyJudgments": [{"judgment": "discrete analytic conclusion with [E#] citations", "confidence": "HIGH|MODERATE|LOW", "reasoning": "1-2 sentences on the logic and evidence behind it", "citations": ["E#"]}],
  "keyActors": [{"name": "string", "role": "string", "assessment": "string with [E#] where reported"}],
  "riskFactors": [{"factor": "string", "severity": "critical|high|medium|low", "detail": "string with [E#] where reported"}],
  "competingHypotheses": [{"hypothesis": "refined from the seed set", "likelihood": "IC probability phrase", "assessment": "which cited evidence supports or undercuts it", "citations": ["E#"]}],
  "assumptions": ["key analytic assumptions the assessment rests on — 2-4 items"],
  "intelligenceGaps": ["specific unanswered questions / missing reporting and what should be collected — 2-5 items"],
  "economicExposure": "paragraph on economic and market risks, cited where reported",
  "outlook30": "30-day outlook with IC probability language",
  "outlook90": "90-day outlook with IC probability language",
  "maritimeAviationPicture": "paragraph assessing the live maritime and aviation picture near this country — volume of traffic, notable vessel types, military aircraft presence, what it signals. If data is sparse, note what absence of traffic itself may indicate.",
  "watchItems": ["string — 4-6 specific, observable indicators to monitor"],
  "methodology": "1-2 sentences: what evidence base and analytic technique this rests on (sources used, ACH, structural inference) — the 'how I know' note",
  "confidenceLevel": "HIGH|MODERATE|LOW — with a one-line justification referring to the actual cited evidence count/quality",
  "analystNotes": ${criticalPlots.length > 0 ? '"paragraph incorporating analyst workspace intelligence"' : 'null'}
}`

  const encoder = new TextEncoder()
  const userIdPromise = getRequestUserId()

  const stream = new ReadableStream({
    async start(controller) {
      const send = (obj: Record<string, unknown>) => {
        controller.enqueue(encoder.encode(`data: ${JSON.stringify(obj)}\n\n`))
      }

      try {
        send({ type: 'meta', country, countryCode, sourceCount: recentEvents.length, plotCount: plots.length })

        const plan = planAiFromRequestWithProvider(req, clientKey?.trim(), vaultGet, 'claude')
        if (plan.useOffline) {
          const template = generateCountryBriefTemplate({
            country, countryCode, recentEvents, projectGoal, researchQuestion,
          })
          send({ type: 'complete', data: { ...template, sources, mode: 'template', offline: true } })
          controller.close()
          return
        }
        if (plan.missingKeys) {
          send({ type: 'error', message: AI_KEYS_MISSING_BODY.error })
          controller.close()
          return
        }

        const effort = (req.headers.get('x-effort') ?? 'medium') as import('@/lib/aiConfig').EffortLevel
        const { resolveMaxTokens } = await import('@/lib/aiConfig')
        const key = plan.key
        if (!key) {
          send({ type: 'error', message: AI_KEYS_MISSING_BODY.error })
          controller.close()
          return
        }

        let buffer = ''
        const t0 = Date.now()

        const result = await runStreamCompletion(
          plan,
          {
            system: systemPrompt,
            prompt: userPrompt,
            maxTokens: resolveMaxTokens(effort, 3000),
            effort,
            temperature: 0.25,
            jsonResponse: !plan.isAnthropic,
          },
          (delta) => {
            buffer += delta
            send({ type: 'chunk', text: delta })
          },
        )

        const userId = await userIdPromise.catch(() => null)
        logAiUsage({
          feature: 'brief', provider: result.provider, model: result.model, effort,
          input_tokens: result.inputTokens, output_tokens: result.outputTokens,
          duration_ms: Date.now() - t0, context: country, user_id: userId ?? undefined,
        }).catch(() => {})

        try {
          const parsed = parseModelJson<Record<string, unknown>>(buffer)
          const cited = citedBriefSources(sources, buffer)
          send({ type: 'complete', data: { ...parsed, sources: cited, mode: 'ai' } })
        } catch {
          const template = generateCountryBriefTemplate({
            country, countryCode, recentEvents, projectGoal, researchQuestion,
          })
          send({
            type: 'complete',
            data: { ...template, sources, mode: 'template', warning: 'AI response was not valid JSON — template used' },
          })
        }
      } catch (err) {
        send({ type: 'error', message: err instanceof Error ? err.message : 'Generation failed' })
      }

      controller.close()
    },
  })

  return new Response(stream, {
    headers: {
      'Content-Type': 'text/event-stream',
      'Cache-Control': 'no-cache',
      'Connection': 'keep-alive',
    },
  })
}
