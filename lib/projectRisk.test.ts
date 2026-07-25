import { describe, it, expect } from 'vitest'
import { projectRisk } from './projectRisk'
import { runLiveAnomalies } from './anomalyEngine'
import { IntelEvent } from '@/types'

function e(country: string, severity: IntelEvent['severity'], over: Partial<IntelEvent> = {}): IntelEvent {
  return {
    id: Math.random().toString(36).slice(2), source: 'gdelt', category: 'conflict',
    title: `${severity} in ${country}`, summary: '',
    lat: 10, lon: 10, country, countryCode: country.slice(0, 2).toUpperCase(),
    severity, timestamp: new Date().toISOString(), url: '', ...over,
  } as unknown as IntelEvent
}

describe('per-project risk (client-side, includes marks)', () => {
  it('aggregates by country on an absolute scale', () => {
    const rows = projectRisk([
      e('Atlantis', 'critical'), e('Atlantis', 'critical'), e('Atlantis', 'high'),
      e('Calmland', 'low'),
    ])
    const atlantis = rows.find(r => r.country === 'Atlantis')!
    const calm = rows.find(r => r.country === 'Calmland')!
    expect(atlantis.score).toBeGreaterThan(calm.score)
    expect(atlantis.criticalCount).toBe(2)
    expect(calm.level).toBe('LOW')
  })

  it('the breakdown composes the score (severity·0.7 + fatality·0.3, neutral velocity)', () => {
    const [row] = projectRisk([e('X', 'critical', { fatalities: 100 }), e('X', 'critical')])
    const expected = Math.round((0.7 * row.severityScore + 0.3 * row.fatalityScore) * 1.0)
    expect(row.score).toBe(expected)
    expect(row.velocityScore).toBe(50) // neutral, no client history
  })

  it('a promoted analyst mark contributes to its country risk', () => {
    const base = projectRisk([e('Frontier', 'low')])
    const withMark = projectRisk([e('Frontier', 'low'), e('Frontier', 'critical', { source: 'analyst' as IntelEvent['source'] })])
    expect(withMark[0].score).toBeGreaterThan(base[0].score)
    expect(withMark[0].eventCount).toBe(2)
  })

  it('ignores Unknown / unattributed events', () => {
    expect(projectRisk([e('Unknown', 'critical'), e('', 'high')])).toHaveLength(0)
  })
})

describe('per-project anomalies include promoted marks', () => {
  it('a spike (incl. an analyst mark) in the final bucket surfaces', () => {
    const now = Date.now()
    const span = 20 * 3600_000
    const events: IntelEvent[] = []
    for (let i = 0; i < 20; i++) events.push(e('Steady', 'medium', { timestamp: new Date(now - span + (i / 20) * span).toISOString() }))
    for (let i = 0; i < 5; i++) events.push(e('Surge', 'high', { timestamp: new Date(now - span * 0.01 + i * 1000).toISOString() }))
    // one of the surge events is a promoted mark
    events.push(e('Surge', 'critical', { source: 'analyst' as IntelEvent['source'], timestamp: new Date(now).toISOString() }))
    const anomalies = runLiveAnomalies(events)
    expect(anomalies.some(a => a.country === 'Surge')).toBe(true)
  })
})
