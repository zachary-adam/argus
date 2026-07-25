/**
 * Country risk scoring — ABSOLUTE scale.
 *
 * The previous model normalised every country's weighted event count against the
 * single worst country of the moment (`score / maxScore * 100`). That made the
 * worst country always 100 → always CRITICAL, even on the calmest possible day,
 * and the displayed sub-scores (velocity/severity/fatality) never actually fed
 * the headline score.
 *
 * This model is absolute and self-contained: a country's score depends only on
 * its own activity, never on what other countries are doing, and the three
 * sub-scores compose the headline score via a documented formula.
 */

export type RiskLevel = 'CRITICAL' | 'HIGH' | 'MEDIUM' | 'LOW'

export const SEV_WEIGHT = { critical: 10, high: 4, medium: 2, low: 1 } as const

// Saturating constants — picked so the scale is interpretable, not relative:
//   K_SEV = 40 weighted units (~4 critical events, or 10 high) → severityScore ≈ 63
//   K_FAT = 1000 reported fatalities → fatalityScore = 100
const K_SEV = 40
const K_FAT = 1000

export function severityWeight(severity: string): number {
  return SEV_WEIGHT[severity as keyof typeof SEV_WEIGHT] ?? 1
}

/** Absolute magnitude of severe activity. Saturates: more never exceeds 100, and
 *  a quiet country stays near 0 regardless of how loud other countries are. */
export function computeSeverityScore(weightedSum: number, k = K_SEV): number {
  if (weightedSum <= 0) return 0
  return Math.round(100 * (1 - Math.exp(-weightedSum / k)))
}

/** Human cost on an absolute log scale (1000 reported fatalities → 100). */
export function computeFatalityScore(fatalities: number, k = K_FAT): number {
  if (fatalities <= 0) return 0
  return Math.round(Math.min(100, (Math.log1p(fatalities) / Math.log1p(k)) * 100))
}

/**
 * Acceleration vs the country's own recent baseline.
 * 50 = neutral/stable (and the default when there is no usable baseline, so an
 * unknown trend neither inflates nor deflates risk). >50 rising, <50 falling.
 * Returns { score, trend, trendPct }.
 */
export function computeVelocity(todayScore: number, baseline: number[]): {
  score: number; trend: 'rising' | 'stable' | 'falling'; trendPct: number
} {
  const prior = baseline.filter(n => n > 0)
  const avgPrev = prior.length ? prior.reduce((s, n) => s + n, 0) / prior.length : 0
  if (avgPrev <= 0) {
    // No baseline → trend unknown → neutral (never the old "75 = high" inflation).
    return { score: 50, trend: 'stable', trendPct: 0 }
  }
  const trendPct = Math.round(((todayScore - avgPrev) / avgPrev) * 100)
  const trend: 'rising' | 'stable' | 'falling' = trendPct > 15 ? 'rising' : trendPct < -15 ? 'falling' : 'stable'
  // Map ±100% change onto the 0..100 axis around the neutral midpoint, clamped.
  const score = Math.min(100, Math.max(0, Math.round(50 + trendPct * 0.5)))
  return { score, trend, trendPct }
}

/**
 * Compose the headline score from the three sub-scores.
 * Severity + fatalities define the *current* danger (state); velocity *modulates*
 * it (±25%) rather than adding a floor — so a calm country with a neutral trend
 * is not pushed into a higher band just for existing.
 */
export function composeRiskScore(parts: { severityScore: number; velocityScore: number; fatalityScore: number }): number {
  const state = 0.7 * parts.severityScore + 0.3 * parts.fatalityScore
  const velocityFactor = 0.75 + 0.5 * (parts.velocityScore / 100) // 0.75 (falling) … 1.0 (neutral) … 1.25 (rising)
  return Math.round(Math.min(100, state * velocityFactor))
}

export function scoreToLevel(score: number): RiskLevel {
  if (score >= 60) return 'CRITICAL'
  if (score >= 35) return 'HIGH'
  if (score >= 15) return 'MEDIUM'
  return 'LOW'
}
