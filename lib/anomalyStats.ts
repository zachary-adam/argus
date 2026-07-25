/**
 * Statistics for the anomaly engine.
 *
 * Event counts per (country, category) are low-count and overdispersed — they are
 * Poisson-like, NOT Gaussian. The previous engine z-scored daily counts against a
 * Gaussian σ and rescaled a 6h window ×4 to "daily", which inflates noise and
 * over-flags. These primitives model the rate properly:
 *
 *  • buildDailyCountsFixed — fixed calendar axis so empty days are real zeros
 *    (the old code built the axis from observed dates only, biasing the mean high
 *    for sparse keys and suppressing genuine anomalies).
 *  • poissonUpperTail — exact P(X ≥ k | λ), valid at small λ where the normal
 *    approximation fails.
 *  • rateZScore — quasi-Poisson standardized score (variance = λ, inflated by the
 *    observed overdispersion factor) instead of a Gaussian σ.
 *  • benjaminiHochberg — controls the false-discovery rate across the hundreds of
 *    (country, category) tests run each cycle.
 *  • cusumMax — a correct tabular CUSUM on a standardized series (σ-relative slack).
 */

export function mean(v: number[]): number {
  return v.length ? v.reduce((s, x) => s + x, 0) / v.length : 0
}

export function variance(v: number[], mu = mean(v)): number {
  if (v.length < 2) return 0
  return v.reduce((s, x) => s + (x - mu) ** 2, 0) / (v.length - 1)
}

/**
 * Daily counts for ONE series on a fixed calendar window of `days` ending at
 * `endExclusive` (default: start of today, so today's partial day is excluded).
 * Index 0 = oldest day. Days with no events are 0 — not missing.
 */
export function buildDailyCountsFixed(
  timestamps: string[],
  days: number,
  endExclusive: Date = startOfUTCDay(new Date()),
): number[] {
  const counts = new Array(days).fill(0)
  const endMs = endExclusive.getTime()
  const startMs = endMs - days * 86_400_000
  for (const ts of timestamps) {
    const t = new Date(ts).getTime()
    if (!Number.isFinite(t) || t < startMs || t >= endMs) continue
    const idx = Math.floor((t - startMs) / 86_400_000)
    if (idx >= 0 && idx < days) counts[idx]++
  }
  return counts
}

function startOfUTCDay(d: Date): Date {
  return new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate()))
}

/** Exact upper-tail probability P(X ≥ k) for X ~ Poisson(λ). */
export function poissonUpperTail(k: number, lambda: number): number {
  if (k <= 0) return 1
  if (lambda <= 0) return 0 // any positive count is "impossible" under λ=0 → maximally significant
  // P(X ≥ k) = 1 - Σ_{i=0}^{k-1} e^{-λ} λ^i / i!, summed iteratively for stability.
  let term = Math.exp(-lambda) // i = 0
  let cdf = term
  for (let i = 1; i < k; i++) {
    term *= lambda / i
    cdf += term
  }
  return Math.min(1, Math.max(0, 1 - cdf))
}

/**
 * Quasi-Poisson standardized score: (observed - expected) / sqrt(φ·expected),
 * where φ ≥ 1 is the overdispersion factor estimated from the baseline. Falls back
 * to a small floor so a tiny expected rate doesn't produce an infinite score.
 */
export function rateZScore(observed: number, expected: number, dispersion = 1): number {
  const phi = Math.max(1, dispersion)
  const v = Math.max(phi * expected, 0.5)
  return (observed - expected) / Math.sqrt(v)
}

/** Overdispersion factor φ = Var/Mean (≥1) for a baseline series. φ≈1 ⇒ Poisson. */
export function dispersionFactor(baseline: number[]): number {
  const mu = mean(baseline)
  if (mu <= 0) return 1
  return Math.max(1, variance(baseline, mu) / mu)
}

/**
 * Benjamini–Hochberg FDR. Given p-values and target q, returns a boolean[] marking
 * which hypotheses are significant while controlling the expected false-discovery
 * rate at q. Order of input is preserved in the output.
 */
export function benjaminiHochberg(pvalues: number[], q: number): boolean[] {
  const n = pvalues.length
  if (n === 0) return []
  const order = pvalues.map((p, i) => ({ p, i })).sort((a, b) => a.p - b.p)
  let kMax = -1
  for (let rank = 0; rank < n; rank++) {
    if (order[rank].p <= ((rank + 1) / n) * q) kMax = rank
  }
  const sig = new Array(n).fill(false)
  for (let rank = 0; rank <= kMax; rank++) sig[order[rank].i] = true
  return sig
}

/**
 * Tabular CUSUM on a standardized series, detecting a sustained upward shift.
 * `k` is the slack in σ units (0.5 detects a 1σ sustained shift). Returns the peak
 * cumulative sum reached — compare against a control limit h (≈4–5).
 */
export function cusumMax(standardized: number[], k = 0.5): number {
  let s = 0, peak = 0
  for (const x of standardized) {
    s = Math.max(0, s + x - k)
    if (s > peak) peak = s
  }
  return peak
}
