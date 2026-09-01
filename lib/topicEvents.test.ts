import { describe, it, expect } from 'vitest'
import { topicMatchedEvents, hasTopicTargeting } from './topicEvents'
import type { IntelEvent } from '@/types'

const ev = (overrides: Partial<IntelEvent>): IntelEvent => ({
  id: '1', title: 'Election rally', summary: 'Party holds event', category: 'political',
  severity: 'medium', country: 'Nigeria', countryCode: 'NG', lat: 0, lon: 0,
  source: 'gdelt', timestamp: new Date().toISOString(), url: 'https://example.com/1', ...overrides,
})

describe('topicMatchedEvents', () => {
  it('returns empty when no targeting terms', () => {
    expect(topicMatchedEvents([ev({})], { scope: 'country', keywords: [], watchEntities: [] })).toEqual([])
  })

  it('ranks keyword matches', () => {
    const hits = topicMatchedEvents(
      [ev({ title: 'Cricket match' }), ev({ title: 'Election violence reported' })],
      { scope: 'country', keywords: ['election'], watchEntities: [] },
    )
    expect(hits).toHaveLength(1)
    expect(hits[0].event.title).toContain('Election')
  })
})

describe('hasTopicTargeting', () => {
  it('detects configured targeting', () => {
    expect(hasTopicTargeting({ scope: 'local', keywords: ['test'], watchEntities: [] })).toBe(true)
    expect(hasTopicTargeting(undefined)).toBe(false)
  })
})
