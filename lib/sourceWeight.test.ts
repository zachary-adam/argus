import { describe, it, expect } from 'vitest'
import { sourceGrade, eventConfidence, confidenceLabel, natoCode, stalenessFactor, agedConfidence } from './sourceWeight'
import { IntelEvent } from '@/types'

const ev = (over: Partial<IntelEvent>): IntelEvent => ({ source: 'rss', ...over } as IntelEvent)

describe('source reliability weighting (NATO Admiralty)', () => {
  it('grades official sensors high and general feeds mid', () => {
    expect(sourceGrade('usgs')).toEqual({ reliability: 'A', credibility: 1 })
    expect(sourceGrade('rss')).toEqual({ reliability: 'C', credibility: 3 })
    expect(sourceGrade('whoknows')).toEqual({ reliability: 'D', credibility: 4 }) // default
  })

  it('a NASA/USGS reading is more confident than an RSS item', () => {
    expect(eventConfidence(ev({ source: 'usgs' }))).toBeGreaterThan(eventConfidence(ev({ source: 'rss' })))
  })

  it('independent corroboration raises confidence', () => {
    const single = eventConfidence(ev({ source: 'rss', corroborationCount: 1 }))
    const many = eventConfidence(ev({ source: 'rss', corroborationCount: 5 }))
    expect(many).toBeGreaterThan(single)
    expect(many).toBeLessThanOrEqual(1)
  })

  it('explicit per-event grade overrides the source baseline', () => {
    const c = eventConfidence(ev({ source: 'rss', sourceReliability: 'A', sourceCredibility: 1 }))
    expect(c).toBeCloseTo(1, 5)
  })

  it('confidence is in [0,1] and labels map sensibly', () => {
    expect(eventConfidence(ev({ source: 'usgs' }))).toBeLessThanOrEqual(1)
    expect(confidenceLabel(0.9)).toBe('High')
    expect(confidenceLabel(0.6)).toBe('Moderate')
    expect(confidenceLabel(0.35)).toBe('Low')
    expect(confidenceLabel(0.1)).toBe('Unverified')
  })

  it('natoCode renders the grade badge', () => {
    expect(natoCode(ev({ source: 'usgs' }))).toBe('A1')
    expect(natoCode(ev({ source: 'gdelt' }))).toBe('C3')
  })
})

describe('confidence decay (stalenessFactor)', () => {
  const NOW = new Date('2026-07-06T12:00:00Z').getTime()
  const ago = (days: number) => new Date(NOW - days * 86_400_000).toISOString()

  it('does not decay fresh reporting (<72h) or missing timestamps', () => {
    expect(stalenessFactor(ago(1), 1, NOW)).toBe(1)
    expect(stalenessFactor(ago(2.9), 1, NOW)).toBe(1)
    expect(stalenessFactor(undefined, 1, NOW)).toBe(1)
  })

  it('decays single-source claims toward a 0.6 floor at 30 days', () => {
    const mid = stalenessFactor(ago(15), 1, NOW)
    expect(mid).toBeLessThan(1)
    expect(mid).toBeGreaterThan(0.6)
    expect(stalenessFactor(ago(30), 1, NOW)).toBe(0.6)
    expect(stalenessFactor(ago(90), 1, NOW)).toBe(0.6) // floor, never lower
  })

  it('well-corroborated facts rot slower than single-source claims', () => {
    expect(stalenessFactor(ago(30), 3, NOW)).toBe(0.85)
    expect(stalenessFactor(ago(30), 2, NOW)).toBe(0.75)
    expect(stalenessFactor(ago(30), 3, NOW)).toBeGreaterThan(stalenessFactor(ago(30), 1, NOW))
  })

  it('agedConfidence = raw confidence x staleness', () => {
    const e = ev({ source: 'rss', corroborationCount: 1, timestamp: ago(30) })
    expect(agedConfidence(e, NOW)).toBeCloseTo(eventConfidence(e) * 0.6, 5)
  })
})
