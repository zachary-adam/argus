import type { IntelEvent } from '@/types'
import type { BriefEvidenceMode, Project } from '@/types/project'
import { universalToIntel } from '@/lib/eventPersist'
import { resolveEvidenceEvents } from '@/lib/journalView'

/** Max live-feed events in brief [E#] corpus (live mode). */
export const BRIEF_LIVE_CAP = 80
/** Max supplemental live events after curated items (blended mode). */
export const BRIEF_BLENDED_SUPPLEMENTAL_CAP = 30

function mergeProjectAndLiveEvents(project: Project, liveEvents: IntelEvent[]): IntelEvent[] {
  const map = new Map<string, IntelEvent>()
  for (const e of project.events ?? []) {
    map.set(e.id, universalToIntel(e))
  }
  for (const e of liveEvents) {
    map.set(e.id, e)
  }
  return [...map.values()]
}

function briefEventRank(e: IntelEvent): number {
  const sev = e.severity === 'critical' ? 4 : e.severity === 'high' ? 3 : e.severity === 'medium' ? 2 : 1
  return sev
}

/** Trim noisy feeds while keeping highest-severity / newest items. */
export function capBriefEvents(events: IntelEvent[], cap: number): IntelEvent[] {
  if (events.length <= cap) return events
  return [...events]
    .sort((a, b) => briefEventRank(b) - briefEventRank(a) || b.timestamp.localeCompare(a.timestamp))
    .slice(0, cap)
}

/** Events fed into the project brief [E#] corpus based on analyst evidence mode. */
export function resolveBriefEvents(
  project: Project,
  liveEvents: IntelEvent[],
  mode: BriefEvidenceMode = project.briefEvidenceMode ?? 'blended',
): IntelEvent[] {
  const merged = mergeProjectAndLiveEvents(project, liveEvents)
  const journalCount = (project.journal ?? []).length

  if (mode === 'curated') {
    return resolveEvidenceEvents(liveEvents, project, 'journal')
  }

  if (mode === 'live' || journalCount === 0) {
    return capBriefEvents(merged, BRIEF_LIVE_CAP)
  }

  // blended — curated snapshots + capped supplemental live feed (deduped)
  const curated = resolveEvidenceEvents(liveEvents, project, 'journal')
  const ids = new Set(curated.map(e => e.id))
  const supplemental = capBriefEvents(merged.filter(e => !ids.has(e.id)), BRIEF_BLENDED_SUPPLEMENTAL_CAP)
  return [...curated, ...supplemental]
}
