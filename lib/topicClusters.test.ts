import { describe, it, expect } from 'vitest'
import { buildTopicClusters } from './topicClusters'
import type { TopicMatch } from './topicEvents'
import type { IntelEvent } from '@/types'

const ev = (title: string, over: Partial<IntelEvent> = {}): IntelEvent => ({
  id: Math.random().toString(36).slice(2),
  title, summary: '', category: 'political', severity: 'medium',
  country: 'Israel', countryCode: 'IL', lat: 31.5, lon: 34.8,
  source: 'analyst', timestamp: new Date().toISOString(),
  tags: ['aimed-pull'], ...over,
})

const match = (event: IntelEvent, score = 30): TopicMatch => ({
  event, score, matched: ['Israel'], source: 'aimed',
})

describe('buildTopicClusters', () => {
  it('groups headline variants into one cluster', () => {
    const clusters = buildTopicClusters([
      match(ev('Israel cabinet reshuffle amid tensions')),
      match(ev('Israel cabinet reshuffle tensions escalate')),
      match(ev('Hezbollah warns Israel over border', { title: 'Hezbollah warns Israel over border' })),
    ])
    expect(clusters).toHaveLength(2)
    const merged = clusters.find(c => c.sourceCount >= 2)
    expect(merged).toBeDefined()
    expect(merged!.headline.toLowerCase()).toContain('israel')
  })

  it('sorts by score then recency', () => {
    const old = ev('Iran nuclear talks stall', { timestamp: '2026-06-01T00:00:00Z' })
    const recent = ev('Lebanon border clash reported', { timestamp: '2026-06-23T00:00:00Z' })
    const clusters = buildTopicClusters([
      match(old, 20),
      match(recent, 45),
    ])
    expect(clusters[0].headline).toContain('Lebanon')
  })
})
