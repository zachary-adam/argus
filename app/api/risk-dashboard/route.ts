import { NextResponse } from 'next/server'
import { getCache } from '@/lib/cache'
import { readHistory } from '@/lib/eventHistory'
import { IntelEvent } from '@/types'
import {
  severityWeight, computeSeverityScore, computeFatalityScore,
  computeVelocity, composeRiskScore, scoreToLevel, type RiskLevel,
} from '@/lib/riskScoring'
import { eventConfidence } from '@/lib/sourceWeight'
import { displayCountry } from '@/lib/countryNames'

export interface CountryRisk {
  country: string
  countryCode: string
  score: number          // 0-100 ABSOLUTE composite (see lib/riskScoring)
  level: RiskLevel
  trend: 'rising' | 'stable' | 'falling'
  trendPct: number       // % change vs prior-day baseline
  eventCount: number
  criticalCount: number
  fatalities: number
  topEvent: string
  // Breakdown components (each 0-100) — these COMPOSE `score` via composeRiskScore.
  velocityScore: number  // acceleration vs the country's own baseline
  severityScore: number  // absolute magnitude of severe activity (saturating)
  fatalityScore: number  // human cost (absolute log scale)
}

export interface RiskDashboardResponse {
  countries: CountryRisk[]
  globalScore: number
  totalEvents: number
  totalFatalities: number
  generatedAt: string
}

export async function GET(): Promise<NextResponse<RiskDashboardResponse>> {
  const events = getCache<IntelEvent[]>('all-events') ?? []
  const history = readHistory(7)

  // Single pass: accumulate weighted severity, counts, fatalities, top event per country.
  const current: Record<string, {
    weighted: number; count: number; critical: number; high: number;
    fatalities: number; topEvent: string; code: string
  }> = {}

  events.forEach(e => {
    const key = displayCountry(e.country) || 'Unknown'
    if (!current[key]) current[key] = { weighted: 0, count: 0, critical: 0, high: 0, fatalities: 0, topEvent: '', code: e.countryCode || 'XX' }
    const c = current[key]
    c.weighted += severityWeight(e.severity) * eventConfidence(e) // weight by source reliability
    c.count++
    if (e.severity === 'critical') c.critical++
    else if (e.severity === 'high') c.high++
    c.fatalities += e.fatalities ?? 0
    if (!c.topEvent && e.severity === 'critical') c.topEvent = e.title
  })

  // Per-country weighted-severity series over the last 7 days (index 0 = today).
  const historical: Record<string, number[]> = {}
  const now = Date.now()
  history.forEach(h => {
    const d = Math.floor((now - h.ts) / 86_400_000)
    if (d < 0 || d >= 7) return
    h.events.forEach(e => {
      const key = displayCountry(e.country) || 'Unknown'
      if (!historical[key]) historical[key] = Array(7).fill(0)
      historical[key][d] += severityWeight(e.severity)
    })
  })

  const countries: CountryRisk[] = Object.entries(current)
    .filter(([, v]) => v.count > 0)
    .map(([country, v]) => {
      const hist = historical[country]
      // Today's weighted activity vs prior days (indices 1..6) as the baseline.
      const { score: velocityScore, trend, trendPct } = computeVelocity(
        v.weighted,
        hist ? hist.slice(1) : [],
      )
      const severityScore = computeSeverityScore(v.weighted)
      const fatalityScore = computeFatalityScore(v.fatalities)
      const score = composeRiskScore({ severityScore, velocityScore, fatalityScore })

      return {
        country,
        countryCode: v.code,
        score,
        level: scoreToLevel(score),
        trend,
        trendPct,
        eventCount: v.count,
        criticalCount: v.critical,
        fatalities: v.fatalities,
        topEvent: v.topEvent || '',
        velocityScore,
        severityScore,
        fatalityScore,
      }
    })
    .sort((a, b) => b.score - a.score)
    .slice(0, 20)

  // Global score = mean of the top-5 country scores (absolute, so a calm day is low).
  const globalScore = countries.length
    ? Math.round(countries.slice(0, 5).reduce((s, c) => s + c.score, 0) / Math.min(countries.length, 5))
    : 0

  return NextResponse.json({
    countries,
    globalScore,
    totalEvents: events.length,
    totalFatalities: events.reduce((s, e) => s + (e.fatalities ?? 0), 0),
    generatedAt: new Date().toISOString(),
  })
}
