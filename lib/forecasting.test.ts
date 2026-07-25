import { describe, it, expect } from 'vitest'
import { brierScore, accuracyStats, calibrationBins, isDue, dueForecasts, brierVerdict, forecastTrackRecordBlock, type Forecast } from './forecasting'

const f = (probability: number, outcome: 0 | 1 | undefined, over: Partial<Forecast> = {}): Forecast => ({
  id: Math.random().toString(36).slice(2), statement: 's', probability,
  createdAt: '2026-01-01', dueDate: '2026-02-01',
  resolved: outcome !== undefined, outcome, ...over,
})

describe('forecasting — Brier scoring + calibration', () => {
  it('brierScore rewards confident correct calls and punishes confident wrong ones', () => {
    expect(brierScore(1, 1)).toBe(0)        // perfect
    expect(brierScore(0, 0)).toBe(0)        // perfect
    expect(brierScore(1, 0)).toBe(1)        // confidently wrong
    expect(brierScore(0.5, 1)).toBe(0.25)   // hedged
  })

  it('a sharp, correct forecaster beats a hedger (lower mean Brier)', () => {
    const sharp = accuracyStats([f(0.9, 1), f(0.85, 1), f(0.1, 0)])
    const hedge = accuracyStats([f(0.5, 1), f(0.5, 1), f(0.5, 0)])
    expect(sharp.meanBrier!).toBeLessThan(hedge.meanBrier!)
  })

  it('skill score is positive when you beat predicting the base rate', () => {
    const s = accuracyStats([f(0.9, 1), f(0.8, 1), f(0.15, 0), f(0.1, 0)])
    expect(s.skillScore!).toBeGreaterThan(0)
    expect(s.resolved).toBe(4)
    expect(s.baseRate).toBe(0.5)
  })

  it('ignores unresolved forecasts in the stats', () => {
    const s = accuracyStats([f(0.9, 1), f(0.7, undefined)])
    expect(s.resolved).toBe(1)
  })

  it('returns nulls when nothing is resolved yet', () => {
    expect(accuracyStats([f(0.7, undefined)])).toEqual({ resolved: 0, meanBrier: null, baseRate: 0, skillScore: null })
  })

  it('calibration bins compare predicted vs observed', () => {
    const bins = calibrationBins([f(0.9, 1), f(0.95, 1), f(0.1, 0), f(0.05, 0)], 5)
    const high = bins[4] // 0.8–1.0
    const low = bins[0]  // 0.0–0.2
    expect(high.count).toBe(2); expect(high.observed).toBe(1)   // both came true
    expect(low.count).toBe(2);  expect(low.observed).toBe(0)    // neither came true
  })

  it('isDue flags unresolved forecasts past their date', () => {
    expect(isDue(f(0.6, undefined, { dueDate: '2020-01-01' }))).toBe(true)
    expect(isDue(f(0.6, undefined, { dueDate: '2099-01-01' }))).toBe(false)
    expect(isDue(f(0.6, 1, { dueDate: '2020-01-01' }))).toBe(false) // already resolved
  })

  it('dueForecasts returns only unresolved past-due items', () => {
    const list = [
      f(0.6, undefined, { id: 'a', dueDate: '2020-01-01' }),
      f(0.6, undefined, { id: 'b', dueDate: '2099-01-01' }),
      f(0.6, 1, { id: 'c', dueDate: '2020-01-01' }),
    ]
    expect(dueForecasts(list).map(x => x.id)).toEqual(['a'])
  })

  it('brierVerdict maps score bands to plain language', () => {
    expect(brierVerdict(null)).toContain('no resolved')
    expect(brierVerdict(0.05)).toContain('excellent')
    expect(brierVerdict(0.15)).toContain('good')
    expect(brierVerdict(0.4)).toContain('poor')
  })

  it('forecastTrackRecordBlock summarizes resolved calibration, empty until proven', () => {
    expect(forecastTrackRecordBlock([f(0.7, undefined)])).toBe('') // nothing resolved
    const block = forecastTrackRecordBlock([f(0.9, 1), f(0.8, 1), f(0.2, 0), f(0.6, undefined, { dueDate: '2020-01-01' })])
    expect(block).toContain('FORECAST TRACK RECORD')
    expect(block).toContain('3 forecasts resolved')
    expect(block).toContain('past due')
  })
})
