import type { IntelEvent } from '@/types'
import type { Targeting } from '@/types/project'
import { situationRelevance } from '@/lib/relevance'
import { topicSourceBucket } from '@/lib/topicIngest'

export interface TopicMatch {
  event: IntelEvent
  score: number
  matched: string[]
  source: ReturnType<typeof topicSourceBucket>
}

/** Events in the current feed that match project targeting, ranked by relevance. */
export function topicMatchedEvents(
  events: IntelEvent[],
  targeting: Targeting | undefined,
  limit = 25,
): TopicMatch[] {
  if (!targeting) return []
  const hasTerms =
    (targeting.keywords?.length ?? 0) > 0 ||
    (targeting.watchEntities?.length ?? 0) > 0 ||
    !!targeting.placeName?.trim()
  if (!hasTerms) return []

  const aimedBoost = (e: IntelEvent) => (topicSourceBucket(e) === 'aimed' ? 30 : 0)

  return events
    .map(event => {
      const r = situationRelevance(event, targeting)
      return {
        event,
        score: r.score,
        matched: r.matched,
        source: topicSourceBucket(event),
      }
    })
    .filter(x => x.score > 0)
    .sort((a, b) => {
      const as = a.score + aimedBoost(a.event)
      const bs = b.score + aimedBoost(b.event)
      if (Math.abs(as - bs) >= 12) return bs - as
      return new Date(b.event.timestamp).getTime() - new Date(a.event.timestamp).getTime()
    })
    .slice(0, limit)
}

export function hasTopicTargeting(t: Targeting | undefined): boolean {
  if (!t) return false
  return (t.keywords?.length ?? 0) > 0 || (t.watchEntities?.length ?? 0) > 0 || !!t.placeName?.trim()
}
