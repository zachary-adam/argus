import type { IntelEvent } from '@/types'
import type { Project, UniversalEvent } from '@/types/project'
import { isAnchorPinnedEvent, refineIntelEventListSync } from '@/lib/aimedGeo'
import { persistIntelCoordUpdates } from '@/lib/eventPersist'

export interface RefineAimedEventsOpts {
  events: IntelEvent[]
  anchor?: { lat: number; lon: number }
  /** Network geocode pass for events still pinned after gazetteer spread. */
  geocode?: boolean
  project?: Project | null
  updateEvent?: (projectId: string, eventId: string, updates: Partial<UniversalEvent>) => void
}

/**
 * Spread anchor-pinned aimed events (gazetteer + optional geocode) and persist
 * coord changes to project JSON so reloads keep distinct map pins.
 */
export async function refineAimedEventsClient(opts: RefineAimedEventsOpts): Promise<IntelEvent[]> {
  const { events, anchor, geocode = true, project, updateEvent } = opts
  if (!anchor) return events

  let refined = refineIntelEventListSync(events, anchor)
  if (project && updateEvent) persistIntelCoordUpdates(project, refined, updateEvent)

  if (!geocode) return refined

  const stillPinned = refined.filter(e => isAnchorPinnedEvent(e, anchor))
  if (stillPinned.length === 0 || stillPinned.length > 25) return refined

  try {
    const refineRes = await fetch('/api/events/refine-coords', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ events: stillPinned, anchor }),
    })
    if (!refineRes.ok) return refined
    const geocoded = (await refineRes.json()) as IntelEvent[]
    const byId = new globalThis.Map(geocoded.map(e => [e.id, e]))
    refined = refined.map(e => byId.get(e.id) ?? e)
    if (project && updateEvent) persistIntelCoordUpdates(project, refined, updateEvent)
  } catch { /* non-fatal */ }

  return refined
}
