'use client'
import { useMemo } from 'react'
import { useMapStore } from '@/stores/mapStore'
import { useActiveProject } from '@/lib/hooks/useActiveProject'
import { resolveEvidenceEvents } from '@/lib/journalView'

/** Events visible on map + feed — respects journal-only evidence view. */
export function useDisplayEvents() {
  const liveEvents = useMapStore(s => s.events)
  const evidenceView = useMapStore(s => s.evidenceView)
  const project = useActiveProject()

  return useMemo(
    () => resolveEvidenceEvents(liveEvents, project, evidenceView),
    [liveEvents, project, evidenceView],
  )
}
