'use client'
import { useEffect } from 'react'
import { useMapStore } from '@/stores/mapStore'
import { useScopedPlots } from '@/lib/hooks/useScopedPlots'
import { plotToEvent, MARK_EVENT_PREFIX } from '@/lib/markToEvent'

/**
 * Keeps the event feed in sync with promoted analyst marks.
 *
 * A mark flagged `properties.promoted` is surfaced as an `analyst` IntelEvent so it
 * influences correlation, velocity, actor stats, the header threat score, the map,
 * and the AI analyses — the same engines real events feed. Reconciling on every
 * plots change makes promotion durable across reloads (the plot flag is persisted)
 * and reversible (un-promoting removes the event).
 */
export function usePromotedMarks() {
  const plots = useScopedPlots()

  useEffect(() => {
    const addEvent = useMapStore.getState().addEvent
    const removeEvent = useMapStore.getState().removeEvent

    const promoted = plots.filter(p => p.properties?.promoted)
    const desiredIds = new Set(promoted.map(p => `${MARK_EVENT_PREFIX}${p.id}`))

    // Add events for promoted marks not yet present.
    const current = useMapStore.getState().events
    const presentIds = new Set(current.filter(e => e.id.startsWith(MARK_EVENT_PREFIX)).map(e => e.id))
    for (const p of promoted) {
      const id = `${MARK_EVENT_PREFIX}${p.id}`
      if (!presentIds.has(id)) addEvent(plotToEvent(p))
    }
    // Remove mark-events whose plot is gone or no longer promoted.
    for (const id of presentIds) {
      if (!desiredIds.has(id)) removeEvent(id)
    }
  }, [plots])
}
