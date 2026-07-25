import { IntelEvent } from '@/types'
import { HISTORICAL_ANALOGS, HistoricalAnalog } from './analogData'

export interface FeatureVector {
  conflict:      number  // 0–1
  political:     number  // 0–1
  humanitarian:  number  // 0–1
  severity:      number  // 0–1
  velocity:      number  // 0–1
}

const SEV_WEIGHT: Record<string, number> = { critical: 1.0, high: 0.75, medium: 0.35, low: 0.1 }

type EventCategory = IntelEvent['category']

const CONFLICT_CATS     = new Set<EventCategory>(['conflict', 'cyber'])
const POLITICAL_CATS    = new Set<EventCategory>(['political'])
const HUMANITARIAN_CATS = new Set<EventCategory>(['humanitarian', 'disaster', 'earthquake', 'wildfire', 'health', 'environmental'])

export function computeFeatureVector(events: IntelEvent[]): FeatureVector {
  const now = Date.now()
  const thirtyDaysMs = 30 * 24 * 60 * 60 * 1000
  const sevenDaysMs  =  7 * 24 * 60 * 60 * 1000

  const pool = events.filter(e => (now - new Date(e.timestamp).getTime()) <= thirtyDaysMs)
  if (pool.length === 0) return { conflict: 0, political: 0, humanitarian: 0, severity: 0, velocity: 0 }

  const n = pool.length

  let conflictN = 0, politicalN = 0, humanitarianN = 0, sevSum = 0

  for (const e of pool) {
    if (CONFLICT_CATS.has(e.category))     conflictN++
    if (POLITICAL_CATS.has(e.category))    politicalN++
    if (HUMANITARIAN_CATS.has(e.category)) humanitarianN++
    sevSum += SEV_WEIGHT[e.severity] ?? 0.35
  }

  const last7 = pool.filter(e => (now - new Date(e.timestamp).getTime()) <= sevenDaysMs).length
  const prior = pool.length - last7
  const priorDailyRate = prior / 23
  const last7DailyRate = last7 / 7
  const velocityRatio  = priorDailyRate > 0 ? last7DailyRate / priorDailyRate : (last7 > 0 ? 3 : 0)

  return {
    conflict:     conflictN / n,
    political:    politicalN / n,
    humanitarian: humanitarianN / n,
    severity:     sevSum / n,
    velocity:     Math.min(1, velocityRatio / 3),
  }
}

export interface AnalogMatch {
  analog:     HistoricalAnalog
  similarity: number   // 0–100, integer
}

// Weighted Euclidean distance — political/conflict dominate discrimination,
// velocity downweighted because new projects always show high velocity.
const WEIGHTS: Record<keyof FeatureVector, number> = {
  conflict:     1.5,
  political:    1.5,
  humanitarian: 1.0,
  severity:     0.8,
  velocity:     0.3,
}
const MAX_DIST = Math.sqrt(Object.values(WEIGHTS).reduce((s, w) => s + w, 0)) // √5.1 ≈ 2.258

function weightedSimilarity(a: FeatureVector, b: FeatureVector): number {
  const keys = Object.keys(WEIGHTS) as (keyof FeatureVector)[]
  const dist  = Math.sqrt(keys.reduce((s, k) => s + WEIGHTS[k] * (a[k] - b[k]) ** 2, 0))
  return Math.max(0, 1 - dist / MAX_DIST)
}

export function computeAnalogs(events: IntelEvent[]): {
  vector:  FeatureVector
  matches: AnalogMatch[]
  eventCount: number
} {
  const vector = computeFeatureVector(events)

  const matches = HISTORICAL_ANALOGS
    .map(analog => ({
      analog,
      similarity: Math.round(weightedSimilarity(vector, analog.features) * 100),
    }))
    .sort((a, b) => b.similarity - a.similarity)
    .slice(0, 5)

  return { vector, matches, eventCount: events.length }
}
