import type { IntelEvent } from '@/types'
import { storySimilar } from '@/lib/aimedIngest'
import { topicSourceBucket } from '@/lib/topicIngest'
import type { TopicMatch } from '@/lib/topicEvents'

export type ClusterSource = 'aimed' | 'yours' | 'firehose' | 'mixed'

export interface TopicStoryCluster {
  id: string
  headline: string
  events: IntelEvent[]
  matched: string[]
  source: ClusterSource
  sourceCount: number
  outlets: string[]
  latestAt: string
  score: number
}

function clusterSource(events: IntelEvent[]): ClusterSource {
  const buckets = new Set(events.map(topicSourceBucket))
  if (buckets.size === 1) return [...buckets][0] as ClusterSource
  return 'mixed'
}

function pickHeadline(events: IntelEvent[]): string {
  return events.reduce((best, e) => {
    const score = (e.corroborationCount ?? 1) * 10 + e.title.length
    const bestScore = (best.corroborationCount ?? 1) * 10 + best.title.length
    return score > bestScore ? e : best
  }).title
}

function outletsFor(events: IntelEvent[]): string[] {
  const seen = new Set<string>()
  const out: string[] = []
  for (const e of events) {
    const name = e.source_detail ?? e.source
    if (name && !seen.has(name)) { seen.add(name); out.push(name) }
  }
  return out.slice(0, 5)
}

/** Group on-topic events into story clusters — the primary Topic dossier view. */
export function buildTopicClusters(matches: TopicMatch[], limit = 12): TopicStoryCluster[] {
  const clusters: TopicStoryCluster[] = []

  for (const m of matches) {
    const existing = clusters.find(c =>
      storySimilar(c.headline, m.event.title) ||
      c.events.some(e => storySimilar(e.title, m.event.title)),
    )

    if (existing) {
      if (!existing.events.some(e => e.id === m.event.id)) {
        existing.events.push(m.event)
        existing.headline = pickHeadline(existing.events)
        existing.matched = [...new Set([...existing.matched, ...m.matched])]
        existing.source = clusterSource(existing.events)
        existing.sourceCount = existing.events.length
        existing.outlets = outletsFor(existing.events)
        existing.score = Math.max(existing.score, m.score)
        const ts = new Date(m.event.timestamp).getTime()
        if (ts > new Date(existing.latestAt).getTime()) existing.latestAt = m.event.timestamp
      }
    } else {
      clusters.push({
        id: `cluster-${m.event.id}`,
        headline: m.event.title,
        events: [m.event],
        matched: [...m.matched],
        source: clusterSource([m.event]),
        sourceCount: 1,
        outlets: outletsFor([m.event]),
        latestAt: m.event.timestamp,
        score: m.score,
      })
    }
  }

  return clusters
    .sort((a, b) => {
      if (Math.abs(a.score - b.score) >= 10) return b.score - a.score
      return new Date(b.latestAt).getTime() - new Date(a.latestAt).getTime()
    })
    .slice(0, limit)
}
