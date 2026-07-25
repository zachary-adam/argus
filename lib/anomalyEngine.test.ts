import { describe, it, expect } from 'vitest'
import { buildBucketCandidates, scoreCandidates, type Candidate } from './anomalyEngine'
import { IntelEvent } from '@/types'

function ev(country: string, category: string, when: number): IntelEvent {
  return {
    id: Math.random().toString(36).slice(2),
    source: 'test', category: category as IntelEvent['category'],
    title: `${category} in ${country}`, summary: '',
    lat: 10, lon: 10, country, countryCode: 'XX',
    severity: 'medium', timestamp: new Date(when).toISOString(), url: '',
  } as unknown as IntelEvent
}

describe('anomaly engine — behavioural', () => {
  it('flags a genuine end-of-window spike and ignores a steady series', () => {
    const now = Date.now()
    const span = 20 * 3600_000 // 20h spread → ~1h buckets
    const events: IntelEvent[] = []

    // Steady key: ~1 event per bucket across the whole span (no spike).
    for (let i = 0; i < 20; i++) events.push(ev('Steadyland', 'political', now - span + (i / 20) * span))

    // Spike key: nothing until the final bucket, then a burst of 6.
    for (let i = 0; i < 6; i++) events.push(ev('Spikeland', 'conflict', now - span * 0.01 + i * 1000))

    const candidates = buildBucketCandidates(events)
    const alerts = scoreCandidates(candidates)

    const spikeAlert = alerts.find(a => a.country === 'Spikeland')
    const steadyAlert = alerts.find(a => a.country === 'Steadyland')
    expect(spikeAlert).toBeTruthy()
    expect(steadyAlert).toBeFalsy()
  })

  it('does NOT fire on a single isolated event (below the noise floor)', () => {
    const now = Date.now()
    const candidates = buildBucketCandidates([
      ...Array.from({ length: 10 }, (_, i) => ev('A', 'political', now - 20 * 3600_000 + i * 3600_000)),
      ev('Loner', 'cyber', now), // one event, last bucket
    ])
    const alerts = scoreCandidates(candidates)
    expect(alerts.find(a => a.country === 'Loner')).toBeFalsy()
  })

  it('FDR filters borderline candidates that an uncorrected test would keep', () => {
    // 30 independent keys each marginally over expectation (p≈0.04) — uncorrected
    // would surface ~all; FDR at q=0.10 must surface far fewer.
    const candidates: Candidate[] = Array.from({ length: 30 }, (_, i) => ({
      key: `C${i}::political`, observed: 3, expected: 1.2, z: 1.6, cusum: 1, p: 0.04,
      events: [ev(`C${i}`, 'political', Date.now())],
    }))
    const alerts = scoreCandidates(candidates)
    expect(alerts.length).toBeLessThan(30)
  })

  it('reports "emerging activity" rather than a bogus % when baseline ≈ 0', () => {
    const alerts = scoreCandidates([{
      key: 'Newland::conflict', observed: 5, expected: 0.05, z: 4, cusum: 1, p: 1e-6,
      events: [ev('Newland', 'conflict', Date.now())],
    }])
    expect(alerts[0]?.summary).toContain('emerging activity')
  })
})
