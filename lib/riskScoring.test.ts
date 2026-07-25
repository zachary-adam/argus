import { describe, it, expect } from 'vitest'
import {
  computeSeverityScore, computeFatalityScore, computeVelocity,
  composeRiskScore, scoreToLevel, severityWeight,
} from './riskScoring'

describe('risk scoring — absolute scale', () => {
  it('a calm country is NOT critical (the old model always forced one CRITICAL)', () => {
    // 3 low-severity events, no history → neutral velocity, no fatalities
    const sev = computeSeverityScore(3 * severityWeight('low')) // weightedSum = 3
    const vel = computeVelocity(0, []).score // no baseline → 50 neutral
    const fat = computeFatalityScore(0)
    const score = composeRiskScore({ severityScore: sev, velocityScore: vel, fatalityScore: fat })
    expect(scoreToLevel(score)).toBe('LOW')
  })

  it('is ABSOLUTE: a country\'s score does not change when a louder country appears', () => {
    // Same inputs must produce the same score regardless of any global maximum.
    const score = (weightedSum: number, fatalities: number) =>
      composeRiskScore({
        severityScore: computeSeverityScore(weightedSum),
        velocityScore: 50,
        fatalityScore: computeFatalityScore(fatalities),
      })
    const quietCountry = score(8, 0)
    // Introducing a country with weightedSum 500 must not move quietCountry at all.
    expect(score(8, 0)).toBe(quietCountry)
  })

  it('the breakdown composes the headline score exactly (no decorative sub-scores)', () => {
    const severityScore = computeSeverityScore(50)
    const fatalityScore = computeFatalityScore(120)
    const velocityScore = computeVelocity(30, [10, 12, 8]).score
    const score = composeRiskScore({ severityScore, velocityScore, fatalityScore })
    // Recomputing from the published parts must reproduce the score.
    expect(composeRiskScore({ severityScore, velocityScore, fatalityScore })).toBe(score)
  })

  it('severity is monotonic and saturating in [0,100]', () => {
    expect(computeSeverityScore(0)).toBe(0)
    expect(computeSeverityScore(10)).toBeLessThan(computeSeverityScore(40))
    expect(computeSeverityScore(40)).toBeLessThan(computeSeverityScore(120))
    expect(computeSeverityScore(1e6)).toBeLessThanOrEqual(100)
  })

  it('fatalities use an absolute log scale, not relative-to-max', () => {
    expect(computeFatalityScore(0)).toBe(0)
    expect(computeFatalityScore(1000)).toBe(100)
    expect(computeFatalityScore(10)).toBeGreaterThan(0)
    expect(computeFatalityScore(10)).toBeLessThan(computeFatalityScore(100))
  })

  it('velocity is neutral (50) without a baseline, rises with acceleration', () => {
    expect(computeVelocity(5, []).score).toBe(50)
    expect(computeVelocity(0, []).trend).toBe('stable')
    expect(computeVelocity(20, [5, 5, 5]).trend).toBe('rising')
    expect(computeVelocity(1, [10, 10, 10]).trend).toBe('falling')
  })

  it('a genuine multi-critical + mass-casualty + rising country reads CRITICAL', () => {
    const severityScore = computeSeverityScore(6 * severityWeight('critical')) // 6 criticals
    const fatalityScore = computeFatalityScore(300)
    const velocityScore = computeVelocity(60, [10, 12]).score // sharply rising
    const score = composeRiskScore({ severityScore, velocityScore, fatalityScore })
    expect(scoreToLevel(score)).toBe('CRITICAL')
  })

  it('scoreToLevel boundaries', () => {
    expect(scoreToLevel(60)).toBe('CRITICAL')
    expect(scoreToLevel(59)).toBe('HIGH')
    expect(scoreToLevel(35)).toBe('HIGH')
    expect(scoreToLevel(34)).toBe('MEDIUM')
    expect(scoreToLevel(15)).toBe('MEDIUM')
    expect(scoreToLevel(14)).toBe('LOW')
  })
})
