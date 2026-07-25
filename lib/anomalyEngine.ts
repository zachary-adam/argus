/**
 * Anomaly Detection Engine
 *
 * Detects statistical deviations in event frequency per (country, category).
 * Counts are low and overdispersed, so we model the RATE (Poisson/quasi-Poisson)
 * rather than z-scoring Gaussian-style:
 *  - Baseline: daily counts over a fixed 30-day calendar window (zero days kept).
 *  - Current: events in the last 6h, compared to the expected 6h rate (λ·6/24) —
 *    no ×4 rescaling of a noisy sub-sample.
 *  - Significance: exact Poisson upper-tail p-value, then Benjamini–Hochberg FDR
 *    across all (country, category) tests to control false alarms.
 *  - CUSUM on the standardized daily series flags sustained upward shifts.
 *
 * See lib/anomalyStats.ts for the (unit-tested) math primitives.
 */

import { IntelEvent, AnomalyAlert } from '@/types'
import { readHistory } from '@/lib/eventHistory'
import {
  buildDailyCountsFixed, poissonUpperTail, rateZScore, dispersionFactor,
  benjaminiHochberg, cusumMax, mean, variance,
} from '@/lib/anomalyStats'

const FDR_Q = 0.10          // target false-discovery rate
const CUSUM_LIMIT = 4       // control limit for sustained-shift detection
const MIN_OBSERVED = 2      // ignore single-event "spikes" (pure noise)
const WINDOW_HOURS = 6

export interface Candidate {
  key: string
  observed: number
  expected: number          // expected count in the observation window
  z: number
  cusum: number
  p: number
  events: IntelEvent[]
}

export function runAnomalyEngine(liveEvents: IntelEvent[]): AnomalyAlert[] {
  if (liveEvents.length < 10) return []

  const history = readHistory(30)
  const historicalEvents = history.flatMap(h => h.events)

  const today = new Date().toISOString().slice(0, 10)
  const historicalOnly = historicalEvents.filter(e => e.timestamp.slice(0, 10) < today)

  const cutoff = Date.now() - WINDOW_HOURS * 60 * 60 * 1000
  const currentEvents = liveEvents.filter(e => new Date(e.timestamp).getTime() > cutoff)

  if (historicalOnly.length >= 50) {
    return scoreCandidates(buildHistoricalCandidates(currentEvents, historicalOnly))
  }
  return scoreCandidates(buildBucketCandidates(liveEvents))
}

// ── Candidate builders ──────────────────────────────────────────────────────

function buildHistoricalCandidates(
  currentEvents: IntelEvent[],
  historicalEvents: { country: string; category: string; timestamp: string }[],
): Candidate[] {
  // Per-key historical timestamps → fixed 30-day daily baseline.
  const histByKey = new Map<string, string[]>()
  for (const e of historicalEvents) {
    const key = `${e.country}::${e.category}`
    if (!histByKey.has(key)) histByKey.set(key, [])
    histByKey.get(key)!.push(e.timestamp)
  }

  // Current 6h events grouped by key.
  const curByKey = new Map<string, IntelEvent[]>()
  for (const e of currentEvents) {
    const key = `${e.country}::${e.category}`
    if (!curByKey.has(key)) curByKey.set(key, [])
    curByKey.get(key)!.push(e)
  }

  const dayFraction = WINDOW_HOURS / 24
  const candidates: Candidate[] = []

  for (const [key, events] of curByKey) {
    const observed = events.length
    if (observed < MIN_OBSERVED) continue

    const baseline = buildDailyCountsFixed(histByKey.get(key) ?? [], 30)
    const lambdaDay = mean(baseline)
    const phi = dispersionFactor(baseline)
    const expected = lambdaDay * dayFraction

    const z = rateZScore(observed, expected, phi)
    const p = poissonUpperTail(observed, Math.max(expected, 1e-9))

    // Standardized daily series for sustained-shift CUSUM.
    const sd = Math.sqrt(Math.max(phi * lambdaDay, 0.5))
    const cusum = cusumMax(baseline.map(c => (c - lambdaDay) / sd))

    candidates.push({ key, observed, expected, z, cusum, p, events })
  }
  return candidates
}

export function buildBucketCandidates(events: IntelEvent[]): Candidate[] {
  // Fallback before 50+ historical events exist: bucket the live feed by time and
  // compare the latest bucket to the earlier ones (same Poisson treatment).
  const NUM_BUCKETS = 20
  const sorted = [...events].sort((a, b) => new Date(a.timestamp).getTime() - new Date(b.timestamp).getTime())
  if (sorted.length < 2) return []
  const minT = new Date(sorted[0].timestamp).getTime()
  const maxT = new Date(sorted[sorted.length - 1].timestamp).getTime()
  const span = maxT - minT || 1

  const buckets: Map<string, IntelEvent[]>[] = Array.from({ length: NUM_BUCKETS }, () => new Map())
  for (const ev of sorted) {
    const bi = Math.min(NUM_BUCKETS - 1, Math.floor(((new Date(ev.timestamp).getTime() - minT) / span) * NUM_BUCKETS))
    const key = `${ev.country}::${ev.category}`
    if (!buckets[bi].has(key)) buckets[bi].set(key, [])
    buckets[bi].get(key)!.push(ev)
  }

  const keys = new Set<string>()
  buckets.forEach(b => b.forEach((_, k) => keys.add(k)))

  const candidates: Candidate[] = []
  const lastBucket = buckets[NUM_BUCKETS - 1]
  for (const key of keys) {
    const series = buckets.map(b => b.get(key)?.length ?? 0)
    const baseline = series.slice(0, -1)
    const observed = series[series.length - 1]
    const events = lastBucket.get(key) ?? []
    if (observed < MIN_OBSERVED) continue

    const lambda = mean(baseline)
    const phi = dispersionFactor(baseline)
    const z = rateZScore(observed, lambda, phi)            // same time unit → scale 1
    const p = poissonUpperTail(observed, Math.max(lambda, 1e-9))
    const sd = Math.sqrt(Math.max(phi * lambda, 0.5))
    const cusum = cusumMax(baseline.map(c => (c - lambda) / sd))

    candidates.push({ key, observed, expected: lambda, z, cusum, p, events })
  }
  return candidates
}

// ── Scoring + FDR ─────────────────────────────────────────────────────────────

export function scoreCandidates(candidates: Candidate[]): AnomalyAlert[] {
  if (!candidates.length) return []

  // Control the false-discovery rate across all simultaneous tests.
  const significant = benjaminiHochberg(candidates.map(c => c.p), FDR_Q)

  const alerts: AnomalyAlert[] = []
  candidates.forEach((c, i) => {
    // This is a SURGE detector ("early signal before headlines"). Only fire on
    // UPWARD anomalies — observed above expected. A collapse (observed << expected,
    // e.g. a ceasefire) must never read as a critical "upward shift". Both paths
    // therefore require observed > expected.
    const isUpward = c.observed > c.expected
    const isSpike = significant[i] && c.z >= 1.5 && isUpward
    const isSustained = c.cusum >= CUSUM_LIMIT && isUpward
    if (!isSpike && !isSustained) return

    const [country, category] = c.key.split('::')
    const sample = c.events.find(e => e.lat && e.lon)
    const severity: AnomalyAlert['severity'] =
      c.z >= 3 || c.cusum >= 6 ? 'critical' : c.z >= 2 || c.cusum >= CUSUM_LIMIT ? 'high' : 'medium'

    // Only report a percentage when the baseline is meaningful; otherwise it's
    // emerging activity against a near-zero baseline (where % is meaningless).
    const hasBaseline = c.expected >= 0.5
    const deviationPct = hasBaseline ? Math.round(((c.observed - c.expected) / c.expected) * 100) : null
    const deviationText = deviationPct !== null
      ? `${Math.abs(deviationPct)}% ${deviationPct >= 0 ? 'above' : 'below'} the expected rate`
      : `emerging activity with little/no historical baseline`

    alerts.push({
      id: `anomaly-${country.toLowerCase().replace(/\s+/g, '-')}-${category}`,
      country,
      countryCode: c.events[0]?.countryCode ?? 'XX',
      category: category as IntelEvent['category'],
      zScore: Math.round(c.z * 10) / 10,
      cusum: Math.round(c.cusum * 10) / 10,
      observed: c.observed,
      expected: Math.round(c.expected * 10) / 10,
      deviationPct: deviationPct ?? 0,
      severity,
      headline: `Anomalous ${category} Activity — ${country}`,
      summary:
        `${country} showing ${deviationText} for ${category} events. ` +
        `${c.observed} events observed vs ${c.expected.toFixed(1)} expected ` +
        `(Poisson z=${c.z.toFixed(1)}, CUSUM=${c.cusum.toFixed(1)}, p=${c.p.toExponential(1)}, FDR-controlled at q=${FDR_Q}). ` +
        `${isSustained && !isSpike ? `Pattern indicates a sustained ${c.observed >= c.expected ? 'upward' : 'downward'} shift rather than a single spike.` : ''}`.trim(),
      lat: sample?.lat ?? 0,
      lon: sample?.lon ?? 0,
      timestamp: new Date().toISOString(),
    })
  })

  return alerts.sort((a, b) => b.zScore - a.zScore).slice(0, 20)
}

/**
 * Client-side per-project anomalies from the live working set (no server history).
 * Uses the bucket method over the provided events — which include promoted analyst
 * marks — so a mark can surface as / reinforce a project anomaly.
 */
export function runLiveAnomalies(events: IntelEvent[]): AnomalyAlert[] {
  if (events.length < 10) return []
  return scoreCandidates(buildBucketCandidates(events))
}

// Re-exported for potential reuse/inspection.
export { mean, variance }
