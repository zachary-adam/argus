import type { IntelEvent } from '@/types'
import type { Project, UniversalEvent, EventKeepDuration } from '@/types/project'
import { stripHtml } from '@/lib/normalize'
import { computeExpiresAt, applyKeepToIntel } from '@/lib/eventRetention'

const ACTOR_TYPES = new Set(['state', 'non-state', 'individual', 'organization', 'unknown'])

export type PersistIntelOpts = {
  keepDuration?: EventKeepDuration
  journalSaved?: boolean
}

export function intelToUniversal(
  e: Pick<IntelEvent, 'id' | 'title' | 'summary' | 'category' | 'lat' | 'lon' | 'country' | 'countryCode' | 'timestamp' | 'severity' | 'source' | 'url' | 'body' | 'tags' | 'actors' | 'expiresAt' | 'ingestedAt'>,
  projectId: string,
  opts?: PersistIntelOpts,
): UniversalEvent {
  const sevNum = e.severity === 'critical' ? 9 : e.severity === 'high' ? 7 : e.severity === 'medium' ? 5 : 2
  const tags = e.tags?.length ? [...e.tags] : ['added']
  if (!tags.includes('added')) tags.push('added')
  const keep = opts?.journalSaved ? 'forever' : (opts?.keepDuration ?? 'forever')
  const expiresAt = opts?.journalSaved ? undefined : (e.expiresAt ?? computeExpiresAt(keep))
  if (keep === 'forever' && !tags.includes('saved')) tags.push('saved')
  return {
    id: e.id,
    title: e.title ?? '',
    summary: e.summary ?? '',
    category: (e.category ?? 'political') as UniversalEvent['category'],
    lat: e.lat ?? 0,
    lon: e.lon ?? 0,
    country: e.country ?? '',
    countryCode: e.countryCode ?? '',
    locationPrecision: 'city',
    // Carry structured actors through — extraction/enrichment populate these,
    // and actor dossiers (lib/actors.ts) suggest from them.
    actors: (e.actors ?? []).map(a => ({
      name: a.name,
      type: (ACTOR_TYPES.has(a.type) ? a.type : 'unknown') as UniversalEvent['actors'][number]['type'],
      role: a.role,
    })),
    sources: [{ name: e.source ?? 'live', url: e.url ?? '', reliability: 'B', credibility: 3 }],
    sourceCount: 1,
    corroborationCount: 1,
    severity: sevNum,
    confidence: 0.7,
    dataQualityScore: 0.7,
    timestamp: e.timestamp ?? new Date().toISOString(),
    reportedAt: new Date().toISOString(),
    analystComments: [],
    rawSource: (e.source as UniversalEvent['rawSource']) ?? 'gdelt',
    projectId,
    tags,
    flagged: false,
    body: e.body,
    expiresAt,
    ingestedAt: e.ingestedAt,
    journalSaved: opts?.journalSaved || undefined,
  }
}

export function universalToIntel(e: UniversalEvent): IntelEvent {
  const sev = e.severity >= 8 ? 'critical' : e.severity >= 6 ? 'high' : e.severity >= 4 ? 'medium' : 'low'
  return {
    id: e.id,
    title: stripHtml(e.title ?? ''),
    summary: stripHtml(e.summary ?? ''),
    category: e.category as IntelEvent['category'],
    severity: sev,
    lat: e.lat,
    lon: e.lon,
    country: (e.country && e.country !== 'Unknown') ? e.country : '',
    countryCode: (e.countryCode && e.countryCode !== 'Unknown' && e.countryCode !== 'XX') ? e.countryCode : '',
    source: (e.rawSource as IntelEvent['source']) ?? 'gdelt',
    url: e.sources[0]?.url ?? '',
    timestamp: e.timestamp,
    body: e.body,
    actors: e.actors?.length ? e.actors.map(a => ({ name: a.name, type: a.type, role: a.role })) : undefined,
    sourceReliability: e.sources[0]?.reliability,
    sourceCredibility: e.sources[0]?.credibility,
    corroborationCount: e.corroborationCount,
    confidence: e.confidence,
    dataQualityScore: e.dataQualityScore,
    analystComments: e.analystComments?.length ? e.analystComments.map(c => c.text) : undefined,
    flagged: e.flagged || undefined,
    tags: e.tags?.length ? [...e.tags] : undefined,
    expiresAt: e.expiresAt,
    ingestedAt: e.ingestedAt,
  }
}

/** Events that bypass region/relevance filtering — analyst- or system-pinned. */
export function isEventFilterExempt(e: Pick<IntelEvent, 'tags'>): boolean {
  const tags = e.tags ?? []
  return tags.some(t =>
    t === 'targeted' || t === 'analyst-mark' || t === 'added' || t === 'saved' || t === 'aimed-pull' || t === 'ephemeral-rss',
  )
}

/** Write refined lat/lon back into project.events when coords moved. */
export function persistIntelCoordUpdates(
  project: Project,
  refined: IntelEvent[],
  updateEvent: (projectId: string, eventId: string, updates: Partial<UniversalEvent>) => void,
): number {
  let updated = 0
  for (const e of refined) {
    const existing = project.events.find(x => x.id === e.id)
    if (!existing) continue
    const moved =
      Math.abs(existing.lat - e.lat) > 0.001 ||
      Math.abs(existing.lon - e.lon) > 0.001
    if (!moved) continue
    updateEvent(project.id, e.id, { lat: e.lat, lon: e.lon })
    updated++
  }
  return updated
}

/** Copy live-feed events into project.events; optionally refresh body on existing rows. */
export function persistIntelEventsIfMissing(
  project: Project,
  events: IntelEvent[],
  addEvents: (projectId: string, events: UniversalEvent[]) => void,
  updateEvent?: (projectId: string, eventId: string, updates: Partial<UniversalEvent>) => void,
  opts?: PersistIntelOpts,
): number {
  const keep = opts?.journalSaved ? 'forever' : (opts?.keepDuration ?? 'forever')
  const known = new Set(project.events.map(e => e.id))
  const toAdd: UniversalEvent[] = []
  let updated = 0

  for (const e of events) {
    if (!e.id) continue
    const prepared = applyKeepToIntel(e, keep, {
      explicit: !!(opts?.journalSaved || opts?.keepDuration === 'forever'),
    })
    if (!known.has(e.id)) {
      toAdd.push(intelToUniversal(prepared, project.id, opts))
      known.add(e.id)
      continue
    }
    if (!updateEvent) continue
    const existing = project.events.find(x => x.id === e.id)
    if (!existing) continue
    if (opts?.journalSaved) {
      updateEvent(project.id, e.id, {
        journalSaved: true,
        tags: prepared.tags,
        expiresAt: undefined,
        ingestedAt: prepared.ingestedAt,
      })
      updated++
    } else if (opts?.keepDuration && (e.tags ?? []).includes('aimed-pull')) {
      updateEvent(project.id, e.id, {
        tags: prepared.tags,
        expiresAt: prepared.expiresAt,
        ingestedAt: prepared.ingestedAt,
      })
    }
    const inBody = prepared.body?.length ?? 0
    const exBody = existing.body?.length ?? 0
    if (inBody > exBody + 50) {
      updateEvent(project.id, e.id, { body: prepared.body })
      updated++
    }
  }

  if (toAdd.length > 0) addEvents(project.id, toAdd)
  return toAdd.length + updated
}
