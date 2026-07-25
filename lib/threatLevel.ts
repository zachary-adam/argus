/**
 * Single source of truth for count-based threat banding.
 *
 * A theater's threat level was previously derived in several places with
 * different thresholds and labels (home board, brief template), so the same
 * project could read "CRITICAL" on one surface and "ELEVATED" on another.
 * Everything count-based now flows through here.
 *
 * NOTE: this is distinct from lib/riskScoring.ts `scoreToLevel`, which maps a
 * composed 0–100 risk *score* (severity + fatalities + velocity) to a level.
 * That is a different input axis and intentionally separate.
 */
export type ThreatBand = 'critical' | 'elevated' | 'watch'

export function threatBand(criticalCount: number, highCount: number): ThreatBand {
  if (criticalCount > 0) return 'critical'
  if (highCount > 0) return 'elevated'
  return 'watch'
}

export const THREAT_LABEL: Record<ThreatBand, string> = {
  critical: 'CRITICAL',
  elevated: 'ELEVATED',
  watch: 'WATCH',
}
