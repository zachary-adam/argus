import type { IntelEvent } from '@/types'
import type { Targeting } from '@/types/project'
import { isSituationRelevant } from '@/lib/relevance'
import { wordOverlap } from '@/lib/dedup'
import { deduplicateEvents } from '@/lib/dedupEvents'

/** Tags used internally — never show on event cards. */
export const INTERNAL_EVENT_TAGS = new Set([
  'targeted', 'aimed-pull', 'google-news', 'web-search', 'added', 'analyst-mark',
  'retention-forever', 'ephemeral-rss', 'saved',
])

export function userVisibleTags(tags: string[] | undefined): string[] {
  return (tags ?? []).filter(t => !INTERNAL_EVENT_TAGS.has(t))
}

/** Aimed-pull gate — same rules as the live feed (`isSituationRelevant`). */
export function isAimedEventRelevant(
  e: Pick<IntelEvent, 'title' | 'summary' | 'body' | 'country' | 'countryCode'> & { category?: string },
  targeting: Targeting,
  countryCodes: string[] = [],
): boolean {
  return isSituationRelevant(e, targeting, countryCodes.length ? countryCodes : undefined)
}

export function storySimilar(a: string, b: string): boolean {
  if (wordOverlap(a, b) >= 0.35) return true
  const na = a.toLowerCase().replace(/[^a-z0-9\s]/g, ' ')
  const nb = b.toLowerCase().replace(/[^a-z0-9\s]/g, ' ')
  const sharedPhrases = ['no confidence', 'confidence vote', 'confidence motion', 'starmer', 'reshuffle']
  return sharedPhrases.some(p => na.includes(p) && nb.includes(p))
}

/** Second-pass merge for aimed pulls at the same anchor — catches headline variants. */
export function collapseAimedStories(events: IntelEvent[]): IntelEvent[] {
  const first = deduplicateEvents(events)
  const result: IntelEvent[] = []

  const mergeInto = (keep: IntelEvent, dup: IntelEvent) => {
    keep.corroborationCount = (keep.corroborationCount ?? 1) + 1
    const detail = dup.source_detail ?? dup.source
    if (detail && detail !== (keep.source_detail ?? keep.source)) {
      keep.summary = `${keep.summary} · also: ${detail}`
    }
    if (dup.url && !keep.url) keep.url = dup.url
    const tags = new Set([...(keep.tags ?? []), ...(dup.tags ?? [])])
    keep.tags = [...tags]
  }

  for (const ev of first) {
    const match = result.find(kept => {
      if (!kept.tags?.includes('aimed-pull') || !ev.tags?.includes('aimed-pull')) return false
      if (Math.abs(kept.lat - ev.lat) > 0.5 || Math.abs(kept.lon - ev.lon) > 0.5) return false
      return storySimilar(kept.title, ev.title)
    })
    if (match) mergeInto(match, ev)
    else result.push({ ...ev })
  }
  return result
}

/** Filter + dedupe pipeline for aimed ingestion results. */
export function prepareAimedEvents(
  events: IntelEvent[],
  targeting: Targeting,
  countryCodes: string[] = [],
): IntelEvent[] {
  const relevant = events.filter(e => isAimedEventRelevant(e, targeting, countryCodes))
  return collapseAimedStories(relevant)
}
