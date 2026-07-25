import { describe, it, expect } from 'vitest'
import { plotToEvent, nearestCountry, MARK_EVENT_PREFIX } from './markToEvent'
import { Plot } from '@/types'

function mark(over: Partial<Plot> = {}): Plot {
  return {
    id: 'recon_abc', workspace_id: '', type: 'point',
    coordinates: [69.17, 34.52], // Kabul
    label: 'Convoy sighting', created_at: '2026-06-15T00:00:00Z',
    properties: { category: 'military', threat_level: 'high', notes: 'Armored column moving north' },
    ...over,
  } as Plot
}

describe('promote mark → event', () => {
  it('produces a deterministic analyst IntelEvent the engines can use', () => {
    const ev = plotToEvent(mark())
    expect(ev.id).toBe(`${MARK_EVENT_PREFIX}recon_abc`) // stable ⇒ re-promotion dedups
    expect(ev.source).toBe('analyst')
    expect(ev.geoPrecision).toBe('exact')      // precise ⇒ feeds proximity correlation
    expect(ev.lat).toBeCloseTo(34.52, 2)
    expect(ev.lon).toBeCloseTo(69.17, 2)
    expect(ev.tags).toContain('analyst-mark')
  })

  it('maps plot category + threat level onto event category + severity', () => {
    expect(plotToEvent(mark({ properties: { category: 'military', threat_level: 'critical' } })).category).toBe('conflict')
    expect(plotToEvent(mark({ properties: { category: 'military', threat_level: 'critical' } })).severity).toBe('critical')
    expect(plotToEvent(mark({ properties: { category: 'economic', threat_level: 'info' } })).category).toBe('economic')
    expect(plotToEvent(mark({ properties: { category: 'economic', threat_level: 'info' } })).severity).toBe('low')
  })

  it('derives a country from the coordinate so country-grouped rules pick it up', () => {
    const ev = plotToEvent(mark()) // Kabul → Afghanistan
    expect(ev.countryCode).toBe('AF')
    expect(ev.country).toBeTruthy()
  })

  it('uses the centroid for a non-point (zone) plot', () => {
    const zone = mark({ type: 'zone', coordinates: [[0, 0], [2, 0], [2, 2], [0, 2]] })
    const ev = plotToEvent(zone)
    expect(ev.lat).toBeCloseTo(1, 5)
    expect(ev.lon).toBeCloseTo(1, 5)
  })

  it('nearestCountry returns null for the middle of the ocean', () => {
    expect(nearestCountry(-40, -140)).toBeNull() // South Pacific, far from any known location
  })
})
