import type { IntelEvent } from '@/types'
import type { JournalEntry, Project } from '@/types/project'

export type EvidenceView = 'live' | 'journal'

export const NO_AI_FOOTER = '*No AI synthesis — human-curated evidence and analyst notes only.*'

export function journalEventIds(project: Project | null | undefined): Set<string> {
  return new Set(
    (project?.journal ?? [])
      .filter(e => e.kind === 'event' && e.eventId)
      .map(e => e.eventId!),
  )
}

function severityFromNum(n: number): IntelEvent['severity'] {
  if (n >= 8) return 'critical'
  if (n >= 6) return 'high'
  if (n >= 4) return 'medium'
  return 'low'
}

/** Reconstruct a map/feed event from a saved journal snapshot. */
export function intelEventFromJournalEntry(entry: JournalEntry): IntelEvent | null {
  if (entry.kind !== 'event' || !entry.eventId) return null
  if (entry.lat == null || entry.lon == null || (entry.lat === 0 && entry.lon === 0)) return null
  return {
    id: entry.eventId,
    title: entry.title,
    summary: entry.summary ?? '',
    category: (entry.category ?? 'political') as IntelEvent['category'],
    severity: severityFromNum(entry.severity ?? 5),
    lat: entry.lat,
    lon: entry.lon,
    country: entry.country ?? '',
    countryCode: entry.countryCode ?? '',
    source: (entry.source as IntelEvent['source']) ?? 'gdelt',
    url: entry.url ?? '',
    timestamp: entry.eventTimestamp ?? entry.savedAt,
    body: entry.body,
    tags: ['journal-snapshot'],
  }
}

/** Build map-ready events from journal snapshots (includes coords saved at curation time). */
export function journalSnapshotEvents(project: Project | null | undefined): IntelEvent[] {
  if (!project?.journal?.length) return []
  return project.journal
    .filter((e): e is JournalEntry & { eventId: string } => e.kind === 'event' && !!e.eventId)
    .map(intelEventFromJournalEntry)
    .filter(Boolean) as IntelEvent[]
}

/** Live firehose vs journal-curated evidence only. */
export function resolveEvidenceEvents(
  liveEvents: IntelEvent[],
  project: Project | null | undefined,
  view: EvidenceView,
): IntelEvent[] {
  if (view !== 'journal' || !project) return liveEvents

  const ids = journalEventIds(project)
  if (ids.size === 0) return []

  const fromLive = liveEvents.filter(e => ids.has(e.id))
  const liveIdSet = new Set(fromLive.map(e => e.id))
  const snapshots = journalSnapshotEvents(project).filter(e => !liveIdSet.has(e.id))
  return [...fromLive, ...snapshots]
}

export function journalOnlyCount(project: Project | null | undefined): number {
  return journalEventIds(project).size
}
