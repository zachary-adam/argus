/**
 * Forecasting with a self-scoring ledger.
 *
 * Turns ARGUS from a monitor into a forecaster with a measured track record: the
 * analyst (or AI) logs explicit, dated, probabilistic forecasts, resolves them
 * when the deadline passes, and the system scores calibration with the Brier score
 * — the standard metric for probabilistic forecasts (lower = better).
 */

export interface Forecast {
  id: string
  statement: string          // "Pre-election violence escalates in X by …"
  probability: number        // 0–1, the forecaster's predicted chance
  createdAt: string
  dueDate: string            // when it should be resolvable
  basis?: string             // optional rationale / linked evidence
  projectId?: string         // scoped to a workspace when set
  resolved?: boolean
  outcome?: 0 | 1            // 1 = it happened, 0 = it did not
  resolvedAt?: string
}

/** Brier score for a single forecast: (p − outcome)². Range [0,1], lower is better. */
export function brierScore(probability: number, outcome: 0 | 1): number {
  return (probability - outcome) ** 2
}

export interface AccuracyStats {
  resolved: number
  meanBrier: number | null   // null when nothing resolved yet
  baseRate: number           // share of resolved forecasts that came true
  skillScore: number | null  // Brier skill vs always predicting the base rate; >0 = better than chance
}

function resolvedOnly(fs: Forecast[]): Required<Pick<Forecast, 'probability' | 'outcome'>>[] {
  return fs.filter(f => f.resolved && (f.outcome === 0 || f.outcome === 1)) as Required<Pick<Forecast, 'probability' | 'outcome'>>[]
}

export function accuracyStats(forecasts: Forecast[]): AccuracyStats {
  const r = resolvedOnly(forecasts)
  if (r.length === 0) return { resolved: 0, meanBrier: null, baseRate: 0, skillScore: null }
  const meanBrier = r.reduce((s, f) => s + brierScore(f.probability, f.outcome), 0) / r.length
  const baseRate = r.reduce((s, f) => s + f.outcome, 0) / r.length
  // Reference Brier = predicting the base rate every time (climatology).
  const refBrier = r.reduce((s, f) => s + brierScore(baseRate, f.outcome), 0) / r.length
  const skillScore = refBrier > 0 ? 1 - meanBrier / refBrier : null
  return { resolved: r.length, meanBrier, baseRate, skillScore }
}

export interface CalibrationBin { from: number; to: number; predicted: number; observed: number; count: number }

/**
 * Calibration curve: bucket forecasts by predicted probability and compare the
 * mean prediction to the observed frequency of outcomes. A well-calibrated
 * forecaster's points sit on the diagonal (predicted ≈ observed).
 */
export function calibrationBins(forecasts: Forecast[], bins = 5): CalibrationBin[] {
  const r = resolvedOnly(forecasts)
  const out: CalibrationBin[] = []
  for (let i = 0; i < bins; i++) {
    const from = i / bins, to = (i + 1) / bins
    const inBin = r.filter(f => f.probability >= from && (i === bins - 1 ? f.probability <= to : f.probability < to))
    out.push({
      from, to, count: inBin.length,
      predicted: inBin.length ? inBin.reduce((s, f) => s + f.probability, 0) / inBin.length : 0,
      observed: inBin.length ? inBin.reduce((s, f) => s + f.outcome, 0) / inBin.length : 0,
    })
  }
  return out
}

export function isDue(f: Forecast, now = Date.now()): boolean {
  return !f.resolved && new Date(f.dueDate).getTime() <= now
}

/** Unresolved forecasts whose due date has passed — need resolving to keep the record honest. */
export function dueForecasts(forecasts: Forecast[], now = Date.now()): Forecast[] {
  return forecasts.filter(f => isDue(f, now))
}

/** One-line calibration verdict from the mean Brier — plain enough for a brief. */
export function brierVerdict(meanBrier: number | null): string {
  if (meanBrier == null) return 'no resolved forecasts yet'
  if (meanBrier <= 0.1) return 'excellent calibration'
  if (meanBrier <= 0.18) return 'good calibration'
  if (meanBrier <= 0.25) return 'fair calibration'
  return 'poor calibration — probabilities are overconfident or miscalibrated'
}

/**
 * FORECAST TRACK RECORD block for briefs — the analyst's measured calibration,
 * so a deliverable carries its own credibility evidence. Deterministic; '' when
 * nothing has resolved (an unproven record shouldn't be advertised).
 */
export function forecastTrackRecordBlock(forecasts: Forecast[], now = Date.now()): string {
  const stats = accuracyStats(forecasts)
  if (stats.resolved === 0) return ''
  const open = forecasts.filter(f => !f.resolved).length
  const due = dueForecasts(forecasts, now).length
  const skill = stats.skillScore == null ? 'n/a' : `${stats.skillScore > 0 ? '+' : ''}${(stats.skillScore * 100).toFixed(0)}%`
  const lines = [
    'FORECAST TRACK RECORD (this analyst\'s measured calibration on this project — cite it when stating probabilistic judgments so the reader can weight your confidence):',
    `- ${stats.resolved} forecast${stats.resolved !== 1 ? 's' : ''} resolved · mean Brier ${stats.meanBrier!.toFixed(3)} (${brierVerdict(stats.meanBrier)}) · skill vs base rate ${skill} · base rate ${(stats.baseRate * 100).toFixed(0)}%`,
  ]
  if (open > 0) lines.push(`- ${open} forecast${open !== 1 ? 's' : ''} still open${due > 0 ? ` (${due} past due and unresolved — the record is incomplete until resolved)` : ''}.`)
  return lines.join('\n')
}
