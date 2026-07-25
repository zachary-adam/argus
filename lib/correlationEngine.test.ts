import { describe, it, expect } from 'vitest'
import { runCorrelationEngine } from './correlationEngine'
import { CHOKEPOINTS } from './constants'
import { IntelEvent } from '@/types'

const HORMUZ = CHOKEPOINTS[0] // Strait of Hormuz

function atHormuz(id: string, precision?: IntelEvent['geoPrecision']): IntelEvent {
  return {
    id, source: 'gdelt', category: 'conflict',
    title: `Naval incident ${id} near strait`, summary: '',
    lat: HORMUZ.lat, lon: HORMUZ.lon, country: 'Iran', countryCode: 'IR',
    severity: 'high', timestamp: new Date().toISOString(), url: '',
    geoPrecision: precision,
  } as unknown as IntelEvent
}

function conflict(country: string, ageH: number, severity: IntelEvent['severity'] = 'high'): IntelEvent {
  return {
    id: Math.random().toString(36).slice(2), source: 'gdelt', category: 'conflict',
    title: `Conflict in ${country}`, summary: '',
    lat: 30 + Math.random(), lon: 40 + Math.random(), country, countryCode: 'XX',
    severity, timestamp: new Date(Date.now() - ageH * 3_600_000).toISOString(), url: '',
  } as unknown as IntelEvent
}

describe('correlation engine — base-rate-relative escalation', () => {
  const recentAge = 10   // within the 168h recent window
  const baseAge = 240    // within the 168–336h baseline window

  it('a BUSY country at its normal rate does NOT fire escalation (alert-fatigue fix)', () => {
    const events = [
      ...Array.from({ length: 20 }, () => conflict('Busyland', baseAge)),   // baseline
      ...Array.from({ length: 10 }, () => conflict('Busyland', recentAge)), // expected ≈10 → normal
      conflict('Busyland', recentAge, 'critical'),
    ]
    const alerts = runCorrelationEngine(events)
    expect(alerts.some(a => a.pattern === 'Conflict Escalation')).toBe(false)
  })

  it('the SAME country with a real spike above its baseline DOES fire', () => {
    const events = [
      ...Array.from({ length: 20 }, () => conflict('Busyland', baseAge)),   // baseline
      ...Array.from({ length: 22 }, () => conflict('Busyland', recentAge)), // well above expected ≈10
      conflict('Busyland', recentAge, 'critical'),
    ]
    const alerts = runCorrelationEngine(events)
    expect(alerts.some(a => a.pattern === 'Conflict Escalation')).toBe(true)
  })

  it('a QUIET country fires at the floor (new activity, no baseline)', () => {
    const events = [
      ...Array.from({ length: 3 }, () => conflict('Quietland', recentAge)),
      conflict('Quietland', recentAge, 'critical'), // 4 total ≥ minEvents floor
    ]
    const alerts = runCorrelationEngine(events)
    expect(alerts.some(a => a.pattern === 'Conflict Escalation' && a.countries.includes('Quietland'))).toBe(true)
  })
})

describe('correlation engine — centroid events do not poison proximity alerts', () => {
  it('precisely-located events at a chokepoint DO raise a maritime alert', () => {
    const events = [atHormuz('a', 'exact'), atHormuz('b', 'exact'), atHormuz('c', 'exact')] // minEvents=3
    const alerts = runCorrelationEngine(events)
    expect(alerts.some(a => a.pattern === 'Maritime Interdiction')).toBe(true)
  })

  it('country-centroid events that happen to sit near a chokepoint do NOT', () => {
    // Same coordinates, but flagged as country-level placements (e.g. GDELT centroid).
    const events = [atHormuz('a', 'country'), atHormuz('b', 'country'), atHormuz('c', 'country')]
    const alerts = runCorrelationEngine(events)
    expect(alerts.some(a => a.pattern === 'Maritime Interdiction')).toBe(false)
  })
})
