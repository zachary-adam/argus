/**
 * Significance test for velocity (event-rate change).
 *
 * The panel showed a raw % change with no notion of significance, so a 2→4 jump
 * (+100%) looked identical to 20→40 even though the former is well within Poisson
 * noise. This flags whether an observed count is a real deviation from the
 * expected rate, so the UI can mark low-confidence rows.
 */

/**
 * @param recent    observed count in the recent window
 * @param expected  expected count in the recent window (prior rate, already scaled
 *                  to the recent window length)
 * Returns true only when the recent count is both materially large (≥4) and a
 * ≥2σ Poisson deviation from expectation — i.e. unlikely to be noise.
 */
export function rateChangeSignificant(recent: number, expected: number): boolean {
  const variance = Math.max(expected, 1) // floor so a near-zero baseline doesn't explode z
  const z = (recent - expected) / Math.sqrt(variance)
  return recent >= 4 && Math.abs(z) >= 2
}
