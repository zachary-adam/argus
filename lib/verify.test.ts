import { describe, it, expect } from 'vitest'
import { gatherEvidence, heuristicVerdict } from './verify'
import { IntelEvent } from '@/types'

const ev = (o: Partial<IntelEvent>): IntelEvent => ({
  id: Math.random().toString(36).slice(2),
  source: 'rss', category: 'political', title: '', summary: '',
  lat: 22.5, lon: 88.3, country: 'India', countryCode: 'IN',
  severity: 'medium', timestamp: '2026-06-15T10:00:00Z', url: '',
  ...o,
})

const claim = ev({
  title: 'Army assaulting civilians during West Bengal polling',
  country: 'India', countryCode: 'IN', source: 'rss',
})

describe('gatherEvidence', () => {
  it('surfaces related corpus events and ranks them above unrelated ones', () => {
    const corpus = [
      ev({ title: 'Clashes reported at West Bengal polling stations', countryCode: 'IN', source: 'gdelt' }),
      ev({ title: 'Tokyo stock market rises on tech earnings', countryCode: 'JP', lat: 35.6, lon: 139.7, source: 'rss' }),
      ev({ title: 'Security forces deployed across Bengal districts amid polling', countryCode: 'IN', source: 'acled' }),
    ]
    const evidence = gatherEvidence(claim, corpus)
    expect(evidence.length).toBe(2)                         // Tokyo excluded (no overlap)
    expect(evidence.every(e => e.countryCode === 'IN')).toBe(true)
  })

  it('never includes the claim itself', () => {
    const evidence = gatherEvidence(claim, [claim, ev({ title: 'Bengal polling violence reported', countryCode: 'IN' })])
    expect(evidence.find(e => e.id === claim.id)).toBeUndefined()
  })
})

describe('heuristicVerdict (no-AI fallback)', () => {
  it('marks a claim with broad multi-source corroboration as supported', () => {
    const evidence = [ev({ source: 'gdelt' }), ev({ source: 'acled' }), ev({ source: 'reliefweb' })]
    const r = heuristicVerdict(claim, evidence)
    expect(r.verdict).toBe('supported')
    expect(r.confidence).toBeGreaterThan(0.6)
  })

  it('stays "unverified" on thin evidence — never over-claims', () => {
    expect(heuristicVerdict(claim, []).verdict).toBe('unverified')
  })

  it('marks info-ops-flagged claims as disputed', () => {
    expect(heuristicVerdict(ev({ ...claim, infoOps: true }), []).verdict).toBe('disputed')
  })
})
