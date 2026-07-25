import { describe, expect, it } from 'vitest'
import { trimEventsForCloudSync, CLOUD_EVENT_SYNC_MAX } from './projects'
import type { UniversalEvent } from '@/types/project'

function ev(id: string, extra: Partial<UniversalEvent> = {}): UniversalEvent {
  return {
    id,
    title: `Event ${id}`,
    summary: 'x'.repeat(5000),
    category: 'conflict',
    lat: 0,
    lon: 0,
    country: 'India',
    countryCode: 'IN',
    locationPrecision: 'country',
    actors: [],
    sources: [],
    sourceCount: 1,
    corroborationCount: 1,
    severity: 5,
    confidence: 0.5,
    dataQualityScore: 0.5,
    timestamp: new Date().toISOString(),
    reportedAt: new Date().toISOString(),
    analystComments: Array.from({ length: 30 }, (_, i) => ({
      id: `c${i}`,
      text: 'comment',
      author: 'a',
      createdAt: new Date().toISOString(),
    })),
    rawSource: 'gdelt',
    projectId: 'p1',
    tags: [],
    flagged: false,
    ...extra,
  }
}

describe('trimEventsForCloudSync', () => {
  it('caps summary and analyst comments', () => {
    const [one] = trimEventsForCloudSync([ev('a')])
    expect(one.summary.length).toBeLessThanOrEqual(1500)
    expect(one.analystComments.length).toBeLessThanOrEqual(15)
  })

  it('always keeps curated events', () => {
    const curated = ev('saved', { journalSaved: true, tags: ['saved'] })
    const bulk = Array.from({ length: CLOUD_EVENT_SYNC_MAX + 50 }, (_, i) =>
      ev(`e${i}`, { timestamp: new Date(Date.now() - i * 1000).toISOString() }),
    )
    const out = trimEventsForCloudSync([curated, ...bulk])
    expect(out.some(e => e.id === 'saved')).toBe(true)
    expect(out.length).toBeLessThanOrEqual(CLOUD_EVENT_SYNC_MAX + 1)
  })

  it('drops ephemeral RSS from cloud payload', () => {
    const rss = ev('rss', { tags: ['ephemeral-rss'] })
    const out = trimEventsForCloudSync([rss])
    expect(out).toHaveLength(0)
  })
})
