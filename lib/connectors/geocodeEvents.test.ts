import { describe, it, expect, vi, beforeEach } from 'vitest'
import type { NormalizedEvent } from '@/lib/normalize'

// Mock only the network geocoder; keep the real extractLocationQuery logic.
const geocodeBestEffort = vi.fn()
vi.mock('@/lib/geocode', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/lib/geocode')>()
  return { ...actual, geocodeBestEffort: (q: string) => geocodeBestEffort(q) }
})

import { geocodeEvents } from './geocodeEvents'

function ev(partial: Partial<NormalizedEvent> & { title: string }): NormalizedEvent {
  return {
    id: crypto.randomUUID(), title: partial.title, description: '', timestamp: new Date().toISOString(),
    location: partial.location ?? { name: 'Unknown' }, actors: [], categories: ['political'],
    severity: 'medium', source: { name: 's', type: 'independent', credibility: 80 },
  }
}

describe('geocodeEvents', () => {
  beforeEach(() => geocodeBestEffort.mockReset())

  it('upgrades an unresolved event using a place pulled from the headline', async () => {
    geocodeBestEffort.mockResolvedValue({ lat: 13.62, lon: 25.35, country: 'Sudan', countryCode: 'SD' })
    const [out] = await geocodeEvents([ev({ title: 'Fighting intensifies in El Fasher as siege tightens', location: { name: 'Unknown', country: 'SD' } })])
    expect(geocodeBestEffort).toHaveBeenCalledTimes(1)
    expect(out.location.lat).toBeCloseTo(13.62)
    expect(out.location.lng).toBeCloseTo(25.35)
    expect(out.location.country).toBe('SD')
  })

  it('leaves gazetteer-placed events untouched (no network call)', async () => {
    const placed = ev({ title: 'Strike near Kyiv', location: { name: 'Kyiv', lat: 50.45, lng: 30.52, country: 'UA' } })
    const [out] = await geocodeEvents([placed])
    expect(geocodeBestEffort).not.toHaveBeenCalled()
    expect(out).toBe(placed)
  })

  it('keeps the original event when no place can be extracted from the headline', async () => {
    const [out] = await geocodeEvents([ev({ title: 'Markets rally on rate-cut hopes' })])
    expect(geocodeBestEffort).not.toHaveBeenCalled()
    expect(out.location.name).toBe('Unknown')
  })

  it('falls back to the original event when the geocoder fails', async () => {
    geocodeBestEffort.mockResolvedValue(null)
    const input = ev({ title: 'Clashes reported in Nyala', location: { name: 'Unknown', country: 'SD' } })
    const [out] = await geocodeEvents([input])
    expect(out.location.lat).toBeUndefined()
  })

  it('respects the lookup budget', async () => {
    geocodeBestEffort.mockResolvedValue({ lat: 1, lon: 1, country: 'X', countryCode: 'XX' })
    const events = Array.from({ length: 5 }, (_, i) => ev({ title: `Attack in Town${i}`, location: { name: 'Unknown', country: 'SD' } }))
    await geocodeEvents(events, { max: 2, concurrency: 1 })
    expect(geocodeBestEffort).toHaveBeenCalledTimes(2)
  })
})
