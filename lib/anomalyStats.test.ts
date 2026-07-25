import { describe, it, expect } from 'vitest'
import {
  buildDailyCountsFixed, poissonUpperTail, rateZScore, dispersionFactor,
  benjaminiHochberg, cusumMax, mean, variance,
} from './anomalyStats'

describe('anomaly statistics', () => {
  describe('buildDailyCountsFixed — fixed calendar axis (the old bias bug)', () => {
    const end = new Date('2026-06-15T00:00:00Z') // exclusive
    it('returns exactly `days` buckets with empty days as real zeros', () => {
      // one event 2 days before the end window
      const counts = buildDailyCountsFixed(['2026-06-13T10:00:00Z'], 7, end)
      expect(counts).toHaveLength(7)
      expect(counts.reduce((a, b) => a + b, 0)).toBe(1)
      // 6 of 7 days are zero — these zeros MUST be present (old code dropped them)
      expect(counts.filter(c => c === 0)).toHaveLength(6)
    })
    it('excludes today (partial) and events outside the window', () => {
      const counts = buildDailyCountsFixed(
        ['2026-06-15T01:00:00Z', '2026-05-01T00:00:00Z', '2026-06-14T12:00:00Z'],
        7, end,
      )
      expect(counts.reduce((a, b) => a + b, 0)).toBe(1) // only the 06-14 event counts
    })
    it('a sparse series has a LOW mean (old code biased it high by dropping zeros)', () => {
      // 1 event in 30 days → true daily mean ≈ 0.033, not ≈1
      const counts = buildDailyCountsFixed(['2026-06-10T00:00:00Z'], 30, end)
      expect(mean(counts)).toBeCloseTo(1 / 30, 5)
    })
  })

  describe('poissonUpperTail — exact at small λ', () => {
    it('matches closed-form values', () => {
      expect(poissonUpperTail(0, 5)).toBe(1)
      expect(poissonUpperTail(1, 1)).toBeCloseTo(1 - Math.exp(-1), 6)       // 0.6321
      expect(poissonUpperTail(2, 1)).toBeCloseTo(1 - 2 * Math.exp(-1), 6)   // 0.2642
    })
    it('any positive count under λ=0 is maximally significant', () => {
      expect(poissonUpperTail(3, 0)).toBe(0)
    })
    it('is monotonic: larger observed ⇒ smaller tail prob', () => {
      expect(poissonUpperTail(5, 2)).toBeLessThan(poissonUpperTail(3, 2))
    })
  })

  describe('rateZScore — quasi-Poisson, not Gaussian-on-counts', () => {
    it('uses Poisson variance (sqrt λ), so a small spike is not over-scored', () => {
      // observed 4 vs expected 1: Poisson z = (4-1)/sqrt(1) = 3
      expect(rateZScore(4, 1, 1)).toBeCloseTo(3, 6)
    })
    it('overdispersion deflates the score (φ>1 widens the variance)', () => {
      expect(rateZScore(4, 1, 4)).toBeLessThan(rateZScore(4, 1, 1))
    })
    it('does not explode when expected→0 (variance floor)', () => {
      expect(Number.isFinite(rateZScore(3, 0, 1))).toBe(true)
    })
  })

  it('dispersionFactor is 1 for Poisson-like data, >1 for clustered', () => {
    expect(dispersionFactor([2, 2, 2, 2])).toBe(1)            // zero variance → floored at 1
    expect(dispersionFactor([0, 0, 0, 20])).toBeGreaterThan(1) // bursty/clustered
  })

  describe('benjaminiHochberg — false-discovery control', () => {
    it('rejects nothing when all p-values are large', () => {
      expect(benjaminiHochberg([0.9, 0.8, 0.7], 0.05)).toEqual([false, false, false])
    })
    it('rejects the clearly-significant ones', () => {
      const sig = benjaminiHochberg([0.001, 0.2, 0.5, 0.9], 0.05)
      expect(sig[0]).toBe(true)
      expect(sig.slice(1)).toEqual([false, false, false])
    })
    it('is stricter than an uncorrected per-test threshold', () => {
      // Uncorrected (p<0.05) rejects 0.001 AND 0.045; BH rejects only 0.001
      // because 0.045 > (2/3)·0.05 = 0.0333 and 0.06 > 0.05.
      const sig = benjaminiHochberg([0.001, 0.045, 0.06], 0.05)
      expect(sig).toEqual([true, false, false])
      const uncorrected = [0.001, 0.045, 0.06].filter(p => p < 0.05).length
      expect(uncorrected).toBe(2)            // uncorrected would flag 2
      expect(sig.filter(Boolean)).toHaveLength(1) // BH flags only 1
    })
  })

  describe('cusumMax — sustained shift detection', () => {
    it('stays low for noise around zero', () => {
      expect(cusumMax([0.2, -0.3, 0.1, -0.2, 0.3])).toBeLessThan(1)
    })
    it('grows under a sustained upward shift', () => {
      expect(cusumMax([2, 2, 2, 2, 2])).toBeGreaterThan(4)
    })
    it('never goes negative (resets at 0)', () => {
      expect(cusumMax([-5, -5, -5])).toBe(0)
    })
  })

  it('variance/mean basics', () => {
    expect(mean([1, 2, 3])).toBe(2)
    expect(variance([2, 2, 2])).toBe(0)
  })
})
