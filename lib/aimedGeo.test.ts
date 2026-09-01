import { describe, it, expect } from 'vitest'
import type { IntelEvent } from '@/types'
import {
  isAnchorPinnedEvent,
  refineIntelEventCoordsSync,
  refineIntelEventListSync,
} from './aimedGeo'

const anchor = { lat: 34.23, lon: 77.56 } // Ladakh focus

const ev = (over: Partial<IntelEvent>): IntelEvent => ({
  id: '1',
  title: '',
  summary: '',
  category: 'political',
  severity: 'medium',
  country: 'India',
  countryCode: 'IN',
  lat: anchor.lat,
  lon: anchor.lon,
  source: 'analyst',
  timestamp: new Date().toISOString(),
  url: 'https://example.com/1',
  tags: ['aimed-pull', 'google-news'],
  ...over,
})

describe('isAnchorPinnedEvent', () => {
  it('detects google-news events stacked on anchor', () => {
    expect(isAnchorPinnedEvent(ev({}), anchor)).toBe(true)
  })

  it('ignores events already moved off anchor', () => {
    expect(isAnchorPinnedEvent(ev({ lat: 34.76, lon: 78.14 }), anchor)).toBe(false)
  })

  it('ignores non-aimed feed events', () => {
    expect(isAnchorPinnedEvent(ev({ tags: ['gdelt'] }), anchor)).toBe(false)
  })
})

describe('refineIntelEventCoordsSync', () => {
  it('spreads headline to gazetteer location', () => {
    const out = refineIntelEventCoordsSync(
      ev({ title: 'Clash reported near Galwan valley' }),
      anchor,
    )
    expect(out.lat).toBeCloseTo(34.76, 1)
    expect(out.lon).toBeCloseTo(78.14, 1)
  })

  it('leaves non-pinned events unchanged', () => {
    const gdelt = ev({ tags: ['gdelt'], lat: 20, lon: 30 })
    expect(refineIntelEventCoordsSync(gdelt, anchor)).toBe(gdelt)
  })
})

describe('refineIntelEventListSync', () => {
  it('refines only anchor-pinned hits in a batch', () => {
    const batch = [
      ev({ id: 'a', title: 'Tensions at Pangong Tso lake' }),
      ev({ id: 'b', title: 'Generic headline', tags: ['gdelt'], lat: 20, lon: 30 }),
    ]
    const out = refineIntelEventListSync(batch, anchor)
    expect(out[0].lat).toBeCloseTo(33.76, 1)
    expect(out[1].lat).toBe(20)
  })
})
