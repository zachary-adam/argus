/**
 * Per-project country risk, computed client-side from the working event set
 * (mapStore.events) — which includes promoted analyst marks. Uses the same tested
 * absolute primitives as the global risk dashboard (lib/riskScoring), but velocity
 * is neutral because the client has no historical baseline (that lives server-side).
 *
 * This is what lets a promoted mark actually move a project's risk picture, while
 * the global /api/risk-dashboard stays global.
 */
import { IntelEvent } from '@/types'
import {
  severityWeight, computeSeverityScore, computeFatalityScore,
  composeRiskScore, scoreToLevel, type RiskLevel,
} from './riskScoring'
import { eventConfidence } from './sourceWeight'

export interface ProjectCountryRisk {
  country: string
  countryCode: string
  score: number
  level: RiskLevel
  trend: 'rising' | 'stable' | 'falling'
  trendPct: number
  eventCount: number
  criticalCount: number
  fatalities: number
  topEvent: string
  velocityScore: number
  severityScore: number
  fatalityScore: number
}

const NEUTRAL_VELOCITY = 50 // no client-side history ⇒ trend unknown ⇒ neutral

export function projectRisk(events: IntelEvent[], limit = 20): ProjectCountryRisk[] {
  const agg = new Map<string, {
    weighted: number; count: number; critical: number; fatalities: number; code: string; topEvent: string
  }>()

  for (const e of events) {
    const country = e.country
    if (!country || country === 'Unknown') continue
    if (e.infoOps) continue // fact-check/social noise is not a ground event — don't let it drive risk
    let a = agg.get(country)
    if (!a) { a = { weighted: 0, count: 0, critical: 0, fatalities: 0, code: e.countryCode || 'XX', topEvent: '' }; agg.set(country, a) }
    // Weight each event's severity contribution by source confidence — an A1
    // sensor reading counts more than an unverified C3 feed item.
    a.weighted += severityWeight(e.severity) * eventConfidence(e)
    a.count++
    if (e.severity === 'critical') { a.critical++; if (!a.topEvent) a.topEvent = e.title }
    a.fatalities += e.fatalities ?? 0
  }

  return [...agg.entries()].map(([country, a]) => {
    const severityScore = computeSeverityScore(a.weighted)
    const fatalityScore = computeFatalityScore(a.fatalities)
    const score = composeRiskScore({ severityScore, velocityScore: NEUTRAL_VELOCITY, fatalityScore })
    return {
      country, countryCode: a.code, score, level: scoreToLevel(score),
      trend: 'stable' as const, trendPct: 0,
      eventCount: a.count, criticalCount: a.critical, fatalities: a.fatalities,
      topEvent: a.topEvent || '',
      velocityScore: NEUTRAL_VELOCITY, severityScore, fatalityScore,
    }
  }).sort((x, y) => y.score - x.score).slice(0, limit)
}
