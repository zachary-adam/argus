import type { IntelEvent } from '@/types'
import type { UniversalEvent, EventKeepDuration, LiveFeedRetention, Project } from '@/types/project'
import { journalEventIds } from '@/lib/journalView'

export type { LiveFeedRetention, EventKeepDuration } from '@/types/project'

export const DEFAULT_LIVE_FEED_RETENTION: LiveFeedRetention = '48h'
export const DEFAULT_RSS_MAP_RETENTION: LiveFeedRetention = '7d'
/** Topic-pull rows persisted to project — refreshed each pull, not permanent archive */
export const DEFAULT_AIMED_PULL_RETENTION: EventKeepDuration = '7d'
/** How often the client prunes expired rows from map + project store */
export const RETENTION_PRUNE_INTERVAL_MS = 60 * 1000
/** Analyst explicitly chose “Forever” — skip legacy aimed-pull downgrade on repair */
export const RETENTION_FOREVER_TAG = 'retention-forever'

const MS: Record<LiveFeedRetention | EventKeepDuration, number> = {
  '6h': 6 * 60 * 60 * 1000,
  '24h': 24 * 60 * 60 * 1000,
  '48h': 48 * 60 * 60 * 1000,
  '7d': 7 * 24 * 60 * 60 * 1000,
  '30d': 30 * 24 * 60 * 60 * 1000,
  forever: Infinity,
}

const DATE_FILTER_MS: Record<string, number> = {
  '6h': MS['6h'],
  '24h': MS['24h'],
  '7d': MS['7d'],
  '30d': MS['30d'],
}

export function retentionToMs(r: LiveFeedRetention | EventKeepDuration): number {
  return MS[r]
}

export function computeExpiresAt(
  duration: LiveFeedRetention | EventKeepDuration,
  from = Date.now(),
): string | undefined {
  if (duration === 'forever') return undefined
  return new Date(from + retentionToMs(duration)).toISOString()
}

/** Age anchor for live firehose — when we saw it, not article publish date. */
export function eventAgeAnchor(e: { timestamp: string; ingestedAt?: string }): number {
  return new Date(e.ingestedAt ?? e.timestamp).getTime()
}

export function stampIngested(ev: IntelEvent): IntelEvent {
  return ev.ingestedAt ? ev : { ...ev, ingestedAt: new Date().toISOString() }
}

/** Backfill ingest anchor for legacy live rows still on the map. */
export function ensureIngested(events: IntelEvent[]): IntelEvent[] {
  return events.map(e => {
    if (e.ingestedAt || isCuratedEvent(e) || e.expiresAt) return e
    return stampIngested(e)
  })
}

function ensureUniversalIngested(events: UniversalEvent[]): UniversalEvent[] {
  return events.map(e => {
    if (e.ingestedAt || isCuratedEvent(e) || e.expiresAt) return e
    return { ...e, ingestedAt: new Date().toISOString() }
  })
}

const CURATED_TAGS = new Set(['saved', 'added', 'analyst-mark', 'targeted'])

/** Analyst- or system-pinned events that skip live-feed TTL unless expiresAt is set. */
export function isCuratedEvent(e: {
  tags?: string[]
  journalSaved?: boolean
}): boolean {
  if (e.journalSaved) return true
  return (e.tags ?? []).some(t => CURATED_TAGS.has(t))
}

export function isEphemeralRssTag(tags?: string[]): boolean {
  return (tags ?? []).includes('ephemeral-rss')
}

export function hasExplicitForeverRetention(tags?: string[]): boolean {
  return (tags ?? []).includes(RETENTION_FOREVER_TAG)
}

export function isLiveFirehoseEvent(e: IntelEvent): boolean {
  return !e.expiresAt && !isCuratedEvent(e) && !isEphemeralRssTag(e.tags)
}

export function isEventExpired(
  e: { timestamp: string; ingestedAt?: string; expiresAt?: string; tags?: string[]; journalSaved?: boolean },
  liveRetention: LiveFeedRetention,
  now = Date.now(),
): boolean {
  if (e.expiresAt) return new Date(e.expiresAt).getTime() <= now

  if (isCuratedEvent(e)) return false

  const age = now - eventAgeAnchor(e)
  // Ephemeral RSS always carries expiresAt; this fallback is defensive only.
  const window = retentionToMs(liveRetention)
  return age > window
}

export function isOutsideDateWindow(
  e: { timestamp: string; ingestedAt?: string },
  dateFilter: string,
  now = Date.now(),
): boolean {
  const ms = DATE_FILTER_MS[dateFilter]
  if (!ms) return false
  return now - eventAgeAnchor(e) > ms
}

export function filterIntelByRetention(
  events: IntelEvent[],
  liveRetention: LiveFeedRetention,
  now = Date.now(),
): IntelEvent[] {
  return ensureIngested(events).filter(e => !isEventExpired(e, liveRetention, now))
}

export function filterUniversalByRetention(
  events: UniversalEvent[],
  liveRetention: LiveFeedRetention,
  now = Date.now(),
): UniversalEvent[] {
  return ensureUniversalIngested(events).filter(e => !isEventExpired(e, liveRetention, now))
}

/** Drop non-curated events older than the active date-filter window. */
export function pruneByDateFilter(
  events: IntelEvent[],
  dateFilter: string,
  now = Date.now(),
): IntelEvent[] {
  if (dateFilter === 'all') return events
  return ensureIngested(events).filter(e => isCuratedEvent(e) || !isOutsideDateWindow(e, dateFilter, now))
}

/** Map + optional project store prune for date-window narrowing. */
export function pruneMapAndProjectByDateFilter(
  events: IntelEvent[],
  dateFilter: string,
  project: { id: string; events: { id: string }[] } | null | undefined,
  removeProjectEvent: (projectId: string, eventId: string) => void,
  now = Date.now(),
): IntelEvent[] {
  const pruned = pruneByDateFilter(events, dateFilter, now)
  if (!project) return pruned
  const kept = new Set(pruned.map(e => e.id))
  for (const e of events) {
    if (kept.has(e.id)) continue
    if (project.events.some(pe => pe.id === e.id)) {
      removeProjectEvent(project.id, e.id)
    }
  }
  return pruned
}

export function tagEphemeralRss(
  e: IntelEvent,
  retention: LiveFeedRetention = DEFAULT_RSS_MAP_RETENTION,
): IntelEvent {
  const tags = e.tags?.length ? [...e.tags] : []
  if (!tags.includes('ephemeral-rss')) tags.push('ephemeral-rss')
  return {
    ...e,
    tags,
    ingestedAt: e.ingestedAt ?? new Date().toISOString(),
    expiresAt: computeExpiresAt(retention),
  }
}

/** Apply keep window + curated tags to map events (must match intelToUniversal). */
export function applyKeepToIntel(
  e: IntelEvent,
  keepDuration: EventKeepDuration,
  opts?: { explicit?: boolean },
): IntelEvent {
  const tags = (e.tags ?? []).filter(
    t => t !== 'ephemeral-rss' && (keepDuration === 'forever' || t !== RETENTION_FOREVER_TAG),
  )
  if (!tags.includes('added')) tags.push('added')
  if (keepDuration === 'forever') {
    if (!tags.includes('saved')) tags.push('saved')
    if (opts?.explicit && !tags.includes(RETENTION_FOREVER_TAG)) tags.push(RETENTION_FOREVER_TAG)
  }
  return {
    ...e,
    tags,
    ingestedAt: e.ingestedAt ?? new Date().toISOString(),
    expiresAt: computeExpiresAt(keepDuration),
  }
}

/** Best-effort mapping for the retention picker in event detail. */
export function inferKeepDuration(e: IntelEvent): EventKeepDuration | null {
  if (isLiveFirehoseEvent(e)) return null
  if (!e.expiresAt) return 'forever'
  const remaining = new Date(e.expiresAt).getTime() - Date.now()
  if (remaining <= 0) return '24h'
  const days = remaining / (24 * 60 * 60 * 1000)
  if (days <= 1.5) return '24h'
  if (days <= 10) return '7d'
  return '30d'
}

export function retentionStatusLabel(
  e: IntelEvent,
  liveRetention: LiveFeedRetention = DEFAULT_LIVE_FEED_RETENTION,
): string {
  if (e.expiresAt) {
    const t = new Date(e.expiresAt).getTime()
    if (t <= Date.now()) return 'Timed out — will be removed shortly'
    const hrs = Math.round((t - Date.now()) / 3600000)
    if (hrs < 48) return `Removes automatically in ~${hrs} hours`
    const days = Math.round(hrs / 24)
    return `Removes automatically in ~${days} days`
  }
  if (isCuratedEvent(e)) return 'Saved — stays until you delete it'
  if (isEphemeralRssTag(e.tags)) {
    if (!e.expiresAt) return 'RSS headline only (not saved to project)'
    const t = new Date(e.expiresAt).getTime()
    const hrs = Math.round((t - Date.now()) / 3600000)
    if (hrs < 48) return `RSS headline · removes in ~${hrs} hours`
    return `RSS headline · removes in ~${Math.round(hrs / 24)} days`
  }
  return `Live feed item — drops after ${liveRetention} unless you save it`
}

/** One-time repairs: journal flags + legacy aimed-pull rows saved before 7d TTL. */
export function repairProjectEventRetention(project: Project): UniversalEvent[] | null {
  const journalIds = journalEventIds(project)
  let changed = false
  const events = project.events.map(e => {
    if (journalIds.has(e.id)) {
      const tags = e.tags?.length ? [...e.tags] : []
      if (!tags.includes('saved')) tags.push('saved')
      if (!e.journalSaved || e.expiresAt) {
        changed = true
        return { ...e, journalSaved: true, expiresAt: undefined, tags }
      }
      return e
    }
    if (!(e.tags ?? []).includes('aimed-pull')) return e
    if (e.expiresAt || e.journalSaved || hasExplicitForeverRetention(e.tags)) return e
    changed = true
    return {
      ...e,
      expiresAt: computeExpiresAt(DEFAULT_AIMED_PULL_RETENTION),
      ingestedAt: e.ingestedAt ?? new Date().toISOString(),
    }
  })
  return changed ? events : null
}
