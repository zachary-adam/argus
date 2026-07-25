import { describe, it, expect } from 'vitest'
import { isDuplicate, deduplicateIncoming, wordOverlap } from './dedup'
import { IntelEvent } from '@/types'

function e(id: string, title: string, lat: number, lon: number, ageH = 0): IntelEvent {
  return {
    id, source: 'rss', category: 'conflict', title, summary: '',
    lat, lon, country: 'X', countryCode: 'X', severity: 'high',
    timestamp: new Date(Date.now() - ageH * 3600_000).toISOString(), url: '',
  } as unknown as IntelEvent
}

describe('event dedup (cross-refresh duplicacy)', () => {
  it('flags the SAME article with a different id as a duplicate (ids embed Date.now())', () => {
    const existing = [e('rss-1-1700000000000', 'Missile strike hits Kyiv power grid', 50.45, 30.52)]
    const refetched = e('rss-1-1700000300000', 'Missile strike hits Kyiv power grid', 50.45, 30.52)
    expect(isDuplicate(refetched, existing)).toBe(true)
  })

  it('keeps genuinely different events (different place / different story)', () => {
    const existing = [e('a', 'Missile strike hits Kyiv power grid', 50.45, 30.52)]
    expect(isDuplicate(e('b', 'Flooding displaces thousands in Jakarta', -6.2, 106.8), existing)).toBe(false)
    expect(isDuplicate(e('c', 'Peace talks resume in Geneva summit', 46.2, 6.1), existing)).toBe(false)
  })

  it('does not treat a >24h-apart same-title event as a duplicate', () => {
    const existing = [e('a', 'Missile strike hits Kyiv power grid', 50.45, 30.52, 0)]
    expect(isDuplicate(e('b', 'Missile strike hits Kyiv power grid', 50.45, 30.52, 30), existing)).toBe(false)
  })

  it('deduplicateIncoming drops both id-dupes and content-dupes', () => {
    const existing = [e('rss-1-100', 'Border clashes reported near Goma', -1.68, 29.22)]
    const incoming = [
      e('rss-1-100', 'dup by id', 0, 0),                                  // same id
      e('rss-1-999', 'Border clashes reported near Goma', -1.68, 29.22),  // same content, new id
      e('rss-2-1', 'Election results announced in Brazil', -15.8, -47.9), // genuinely new
    ]
    const fresh = deduplicateIncoming(incoming, existing)
    expect(fresh).toHaveLength(1)
    expect(fresh[0].title).toContain('Election results')
  })

  it('wordOverlap ignores short stopwords and is symmetric-ish', () => {
    expect(wordOverlap('Missile strike hits Kyiv', 'Missile strike near Kyiv')).toBeGreaterThan(0.5)
    expect(wordOverlap('totally different headline', 'unrelated breaking news')).toBe(0)
  })
})
