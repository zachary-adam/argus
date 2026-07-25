/**
 * Base-rate-relative thresholds for the correlation engine.
 *
 * Absolute thresholds ("≥3 conflict events = escalation") are wrong: a high-volume
 * country trips them every day (alert fatigue) while a genuine spike in a quiet
 * country never clears the bar. This compares the recent count against the
 * country's OWN baseline rate using the Poisson model from anomalyStats, so an
 * alert fires on a real deviation from normal — wherever "normal" sits.
 */
import { rateZScore } from './anomalyStats'

/**
 * @param recentCount     events in the recent window for this country/category
 * @param baselineCount   events for the same key over the (older) baseline window
 * @param recentHours     length of the recent window
 * @param baselineHours   length of the baseline window
 * @param minFloor        absolute minimum recent count (kills tiny-number noise)
 * @param zThreshold      Poisson z required above the expected rate (default 2)
 */
export function isRateElevated(
  recentCount: number,
  baselineCount: number,
  recentHours: number,
  baselineHours: number,
  minFloor: number,
  zThreshold = 2,
): boolean {
  if (recentCount < minFloor) return false
  // No baseline history for this country → meeting the floor IS the signal
  // (new activity where there was none).
  if (baselineCount <= 0 || baselineHours <= 0) return true
  const expected = baselineCount * (recentHours / baselineHours)
  return rateZScore(recentCount, expected) >= zThreshold
}
