/**
 * Offline / no-AI intelligence layer — rule-based fallbacks so ARGUS stays usable
 * without OpenAI/Anthropic keys. AI routes call these when keys are absent.
 */
import type { IntelEvent } from '@/types'
import type { GoalCategory } from '@/types/project'
import type { ACHEventScore } from '@/types/project'
import { defaultKeywordsForGoal } from '@/lib/goalTemplates'
import { starterACHHypothesisTexts } from '@/lib/achTemplates'
import { assessEvidenceBalance } from '@/lib/evidenceBalance'
import { codeToName } from '@/lib/countryNames'
import type { CanvasBriefRequest, CanvasBriefResponse } from '@/types/canvasBrief'
import { vaultGet } from '@/lib/vault'

export interface NlqOfflineResult {
  matchingIds: string[]
  summary: string
  appliedFilters: string
  flyTo: { lat: number; lon: number; zoom: number } | null
  resultCount: number
}

const SEV_RANK: Record<string, number> = { critical: 4, high: 3, medium: 2, low: 1 }

/** Keyword pre-filter shared by NLQ (same logic as AI path, extracted for offline use). */
export function prefilterNlqCandidates(query: string, events: IntelEvent[]): IntelEvent[] {
  const q = query.toLowerCase()
  let candidates = events

  const hoursMatch = q.match(/last\s+(\d+)\s*h(?:our)?s?/)
  const daysMatch = q.match(/last\s+(\d+)\s*d(?:ay)?s?/)
  const todayMatch = /\btoday\b/.test(q)
  const weekMatch = /this\s+week|last\s+week/.test(q)
  const now = Date.now()
  if (hoursMatch) {
    candidates = candidates.filter(e => now - new Date(e.timestamp).getTime() < parseInt(hoursMatch[1]) * 3_600_000)
  } else if (daysMatch) {
    candidates = candidates.filter(e => now - new Date(e.timestamp).getTime() < parseInt(daysMatch[1]) * 86_400_000)
  } else if (todayMatch) {
    candidates = candidates.filter(e => now - new Date(e.timestamp).getTime() < 86_400_000)
  } else if (weekMatch) {
    candidates = candidates.filter(e => now - new Date(e.timestamp).getTime() < 7 * 86_400_000)
  }

  const sevKeywords: Record<string, string[]> = {
    critical: ['critical', 'catastrophic'],
    high: ['high', 'major', 'serious'],
    medium: ['medium', 'moderate'],
    low: ['low', 'minor'],
  }
  const sevMatch = Object.entries(sevKeywords).find(([, kws]) => kws.some(kw => q.includes(kw)))
  if (sevMatch) candidates = candidates.filter(e => e.severity === sevMatch[0])

  const catKeywords: Record<string, string[]> = {
    conflict: ['conflict', 'war', 'battle', 'combat', 'fighting'],
    military: ['military', 'troops', 'army', 'missile', 'drone', 'airstrike', 'airbase'],
    political: ['political', 'election', 'parliament', 'government', 'minister', 'coup'],
    diplomatic: ['diplomatic', 'sanctions', 'talks', 'negotiations', 'treaty'],
    economic: ['economic', 'economy', 'trade', 'oil', 'market', 'currency'],
    humanitarian: ['humanitarian', 'refugee', 'displaced', 'aid', 'famine'],
    environmental: ['disaster', 'earthquake', 'flood', 'hurricane', 'wildfire', 'tsunami'],
    health: ['health', 'pandemic', 'outbreak', 'disease'],
    technology: ['cyber', 'hack', 'technology', 'nuclear'],
    social: ['protest', 'demonstration', 'unrest', 'riot'],
  }
  for (const [cat, kws] of Object.entries(catKeywords)) {
    const matchedKw = kws.find(kw => q.includes(kw))
    if (matchedKw) {
      candidates = candidates.filter(e => e.category === cat || e.title.toLowerCase().includes(matchedKw))
      break
    }
  }

  const geoTerms = [
    'iran', 'israel', 'ukraine', 'russia', 'china', 'usa', 'united states', 'india', 'ladakh', 'pakistan',
    'syria', 'iraq', 'lebanon', 'yemen', 'saudi', 'turkey', 'sudan', 'gaza', 'taiwan', 'middle east',
    'north korea', 'south korea', 'myanmar', 'ethiopia', 'somalia', 'afghanistan', 'strait', 'hormuz',
  ]
  const geoHits = geoTerms.filter(g => q.includes(g))
  if (geoHits.length > 0) {
    candidates = candidates.filter(e => {
      const evText = `${e.country} ${e.title}`.toLowerCase()
      return geoHits.some(g => evText.includes(g))
    })
  }

  // Token overlap for free-text terms not caught above
  const tokens = q.split(/\W+/).filter(t => t.length > 3 && !['last', 'days', 'hours', 'events', 'show', 'what'].includes(t))
  if (tokens.length > 0 && candidates.length > events.length * 0.8) {
    candidates = events.filter(e => {
      const text = `${e.title} ${e.summary ?? ''}`.toLowerCase()
      return tokens.some(t => text.includes(t))
    })
  }

  const byId = new Map(candidates.map(e => [e.id, e]))
  for (const e of events.filter(e => e.severity === 'critical' || e.severity === 'high').slice(0, 20)) {
    if (!byId.has(e.id)) byId.set(e.id, e)
  }
  if (byId.size === 0) for (const e of events) byId.set(e.id, e)

  return [...byId.values()].sort((a, b) =>
    (SEV_RANK[b.severity] ?? 0) - (SEV_RANK[a.severity] ?? 0) ||
    new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime(),
  )
}

export function nlqOffline(query: string, events: IntelEvent[]): NlqOfflineResult {
  const ranked = prefilterNlqCandidates(query, events)
  const matchingIds = ranked.slice(0, 40).map(e => e.id)
  const countries = [...new Set(ranked.slice(0, 15).map(e => e.country).filter(Boolean))]
  const critical = ranked.filter(e => e.severity === 'critical').length
  const high = ranked.filter(e => e.severity === 'high').length

  const lats = ranked.filter(e => e.lat && e.lon).map(e => e.lat)
  const lons = ranked.filter(e => e.lat && e.lon).map(e => e.lon)
  let flyTo: NlqOfflineResult['flyTo'] = null
  if (lats.length > 0) {
    const lat = lats.reduce((a, b) => a + b, 0) / lats.length
    const lon = lons.reduce((a, b) => a + b, 0) / lons.length
    const zoom = countries.length > 2 ? 3 : countries.length > 1 ? 4 : 5
    flyTo = { lat, lon, zoom }
  }

  const filters: string[] = []
  if (critical) filters.push(`${critical} critical`)
  if (high) filters.push(`${high} high`)
  if (countries.length) filters.push(countries.slice(0, 3).join(', '))

  const summary = matchingIds.length === 0
    ? 'No events matched your query filters. Try broader terms or a longer time window.'
    : `${matchingIds.length} event${matchingIds.length !== 1 ? 's' : ''} match rule-based filters` +
      (countries.length ? ` across ${countries.slice(0, 3).join(', ')}` : '') +
      (critical + high > 0 ? ` (${critical + high} high-severity).` : '.') +
      ' Offline mode — switch to AI ✦ in the toolbar for narrative assessment.'

  return {
    matchingIds,
    summary,
    appliedFilters: filters.join(' · ') || 'Keyword match',
    flyTo,
    resultCount: matchingIds.length,
  }
}

export function suggestMissionOffline(opts: {
  goalTemplateId?: GoalCategory | string | null
  regionName?: string
  countryCodes?: string[]
  placeName?: string
}): {
  researchQuestion?: string
  suggestedPlace?: string
  keywords: string[]
  entities: string[]
} {
  const goal = (opts.goalTemplateId ?? 'default') as GoalCategory
  const keywords = defaultKeywordsForGoal(String(opts.goalTemplateId))
  const region = opts.regionName?.trim() ?? ''
  const place = opts.placeName?.trim()
  const countries = (opts.countryCodes ?? []).map(c => codeToName(c.toUpperCase())).filter(Boolean) as string[]

  const seeds = starterACHHypothesisTexts({ goalTemplateId: goal, researchQuestion: '' })
  const rq = goal === 'armed-conflict' && countries.length >= 2
    ? `Will ${countries.slice(0, 2).join('–')} tensions escalate in the next 90 days?`
    : region
      ? `What is the near-term trajectory for ${region} over the next 90 days?`
      : `${seeds[0]}?`

  const entities = countries.length >= 2
    ? [`${countries[0]} government`, `${countries[1]} military`, 'United Nations']
    : region ? [region.split(',')[0]?.trim()].filter(Boolean) : []

  return {
    researchQuestion: rq,
    suggestedPlace: place || undefined,
    keywords: keywords.length ? keywords : ['conflict', 'security', 'protest', 'election'],
    entities,
  }
}

export function scoreACHOffline(
  hypotheses: Array<{ id: string; text: string }>,
  events: Array<{ nodeId: string; title: string; summary?: string; body?: string }>,
): ACHEventScore[] {
  const scores: ACHEventScore[] = []
  for (const e of events) {
    const text = `${e.title} ${e.summary ?? ''} ${e.body ?? ''}`.toLowerCase()
    for (const h of hypotheses) {
      const ht = h.text.toLowerCase()
      let rating: ACHEventScore['rating'] = 'neutral'
      let rationale = 'No strong rule-based link to this hypothesis.'

      const escalates = /intensif|escalat|surge|offensive|fighting/.test(ht)
      const stalemate = /stalemate|localized|flare|protracted/.test(ht)
      const diplomacy = /ceasefire|negotiat|diplomacy|pressure|external/.test(ht)

      const hasViolence = /attack|clash|battle|strike|kill|missile|troops|offensive|shell/.test(text)
      const hasDiplomacy = /talks|negotiat|diplomat|summit|disengag|peace|dialogue/.test(text)
      const hasReadiness = /readiness|patrol|standoff|exercise|deploy|infrastructure/.test(text)

      if (escalates) {
        if (hasViolence) { rating = 'supports'; rationale = 'Event reports kinetic or escalation-related activity.' }
        else if (hasDiplomacy) { rating = 'contradicts'; rationale = 'Diplomatic/disengagement signal cuts against escalation hypothesis.' }
      } else if (stalemate) {
        if (hasReadiness && !hasViolence) { rating = 'supports'; rationale = 'Posture/readiness without new kinetic contact fits stalemate pattern.' }
        else if (hasViolence) { rating = 'contradicts'; rationale = 'New kinetic reporting contradicts stalemate hypothesis.' }
      } else if (diplomacy) {
        if (hasDiplomacy) { rating = 'supports'; rationale = 'Diplomatic or disengagement reporting supports this hypothesis.' }
        else if (hasViolence) { rating = 'contradicts'; rationale = 'Kinetic activity undercuts diplomatic breakthrough hypothesis.' }
      }

      scores.push({ nodeId: e.nodeId, hypothesisId: h.id, rating, rationale: `${rationale} (offline ACH)` })
    }
  }
  return scores
}

export function generateCanvasBriefOffline(body: CanvasBriefRequest): CanvasBriefResponse {
  const events = body.events.slice(0, 15)
  const balance = assessEvidenceBalance(
    events.map(e => ({
      title: e.title,
      summary: e.summary ?? e.body,
      country: e.country,
      countryCode: '',
      source: e.source ?? 'canvas',
    })),
    { watchEntities: body.watchEntities, countryCodes: body.countryCodes },
  )

  const critical = events.filter(e => e.severity >= 8).length
  const high = events.filter(e => e.severity >= 6 && e.severity < 8).length
  const countries = [...new Set(events.map(e => e.country).filter(Boolean))]

  const ach = body.achFindings[0]
  const leadHyp = ach?.leadHypothesis ?? 'Insufficient ACH — add hypotheses on canvas'
  const papers = body.papers ?? []

  const keyFindings = events.slice(0, 5).map(e =>
    `${e.title} (${e.country}, ${e.category})`,
  )
  if (papers.length) {
    keyFindings.push(`Research literature: ${papers.slice(0, 3).map(p => p.title).join('; ')}`)
  }

  const riskLevel: CanvasBriefResponse['riskLevel'] =
    critical >= 2 ? 'HIGH' : critical >= 1 || high >= 3 ? 'MODERATE' : 'LOW'

  return {
    headline: events.length === 0
      ? `Insufficient evidence to assess: ${body.researchQuestion}`
      : `${body.regionName}: ${critical + high} high-severity signals among ${events.length} canvas events — offline assessment (no AI).`,
    situation: countries.length
      ? `Canvas holds ${events.length} events across ${countries.slice(0, 4).join(', ')}. ` +
        (ach ? `ACH lead hypothesis: "${leadHyp}" (${ach.leadSupports} supports, ${ach.leadContradicts} contradicts). ` : 'No ACH matrix scored yet. ') +
        'Assessment built from structured rules, correlations, and source grading — not generative AI.'
      : 'No geotagged events on canvas yet.',
    keyFindings: keyFindings.length ? keyFindings : ['Load events onto the canvas before exporting a brief.'],
    riskLevel,
    riskRationale: `${critical} critical and ${high} high-severity events on canvas; evidence balance ${balance.score}/100.`,
    assessmentInsight: ach
      ? `Rule-based read: lead hypothesis "${leadHyp}" — net ${ach.leadSupports - ach.leadContradicts} from manual or offline ACH scores.`
      : papers.length
        ? `${papers.length} academic source(s) on canvas/journal provide structural context — pair with live events for assessment.`
        : 'Complete an ACH matrix on canvas for falsifiable hypothesis separation.',
    watchItems: balance.gaps.slice(0, 4).map(g => g.recommendation),
    analystJudgment: body.researchQuestion
      ? `Offline assessment for "${body.researchQuestion}": evidence supports monitoring posture; ` +
        `${balance.confidenceCap} confidence cap until gaps are closed${ach ? ' and ACH is complete' : ''}.`
      : 'Add a research question in project settings.',
    confidence: balance.confidenceCap,
    confidenceRationale: balance.gaps.length
      ? balance.gaps.map(g => g.label).join('; ') + '. Add AI keys only if you want prose synthesis — core facts are already here.'
      : 'Evidence balance adequate for rule-based assessment.',
  }
}

export function hasServerAiKeys(): boolean {
  return !!(
    vaultGet('OPENAI_API_KEY') ?? process.env.OPENAI_API_KEY
    ?? vaultGet('ANTHROPIC_API_KEY') ?? process.env.ANTHROPIC_API_KEY
  )
}

function sitrepDtg(): string {
  const now = new Date()
  const d = String(now.getUTCDate()).padStart(2, '0')
  const h = String(now.getUTCHours()).padStart(2, '0')
  const m = String(now.getUTCMinutes()).padStart(2, '0')
  const months = ['JAN', 'FEB', 'MAR', 'APR', 'MAY', 'JUN', 'JUL', 'AUG', 'SEP', 'OCT', 'NOV', 'DEC']
  return `${d}${h}${m}Z ${months[now.getUTCMonth()]} ${now.getUTCFullYear()}`
}

/** Rule-based global SITREP when no AI keys — structured markdown from live cache. */
export function generateSitrepOffline(opts: {
  focus: string
  events: IntelEvent[]
  trendCtx?: string
}): string {
  const { focus, events, trendCtx } = opts
  const dtg = sitrepDtg()
  const critical = events.filter(e => e.severity === 'critical').slice(0, 7)
  const high = events.filter(e => e.severity === 'high').slice(0, 7)
  const byCountry: Record<string, number> = {}
  events.forEach(e => { byCountry[e.country] = (byCountry[e.country] || 0) + 1 })
  const topCountries = Object.entries(byCountry).sort((a, b) => b[1] - a[1]).slice(0, 8)
  const fmt = (e: IntelEvent) =>
    `- **[${e.severity.toUpperCase()}]** ${e.country} | ${e.category} | ${e.title}`

  const exec = critical.length > 0
    ? `${critical.length} critical and ${high.length} high-priority events in the live feed. Lead signal: ${critical[0].title} (${critical[0].country}). Offline template — add AI keys for narrative synthesis.`
    : events.length > 0
      ? `${events.length} events tracked; no critical-tier items in current window. Monitor high-priority list below.`
      : 'No events loaded yet — run collection or open a project with aimed pull.'

  return `# ARGUS GLOBAL INTELLIGENCE BRIEF (OFFLINE)
**DTG:** ${dtg} | **Classification:** UNCLASSIFIED // OPEN SOURCE | **Mode:** Rule-based (no AI)

## EXECUTIVE SUMMARY
${exec}

${trendCtx ? `## TREND\n${trendCtx}\n` : ''}## CRITICAL DEVELOPMENTS
${critical.length ? critical.map(fmt).join('\n') : '_None in current dataset._'}

## HIGH-PRIORITY EVENTS
${high.length ? high.map(fmt).join('\n') : '_None in current dataset._'}

## MOST ACTIVE COUNTRIES
${topCountries.map(([c, n]) => `- ${c}: ${n} events`).join('\n') || '_No country breakdown available._'}

## INDICATORS TO WATCH
- Monitor ${focus === 'global' ? 'top active countries' : focus} for new critical-tier events in the next 24–72h
- Cross-check high-severity items against project watch entities on canvas
- Run aimed collect if evidence gaps banner shows missing actor or country coverage

## INTELLIGENCE SUMMARY
- Events processed: ${events.length}
- Critical: ${events.filter(e => e.severity === 'critical').length} | High: ${events.filter(e => e.severity === 'high').length}
- Confirmed fatalities: ${events.reduce((s, e) => s + (e.fatalities || 0), 0)}
- **Note:** This brief is assembled from structured rules. Enable AI in Settings for regional assessments and trajectory analysis.`
}
