'use client'
import { useEffect, useRef } from 'react'
import { useProjectStore } from '@/stores/projectStore'
import { useMapStore } from '@/stores/mapStore'
import { buildNewsQuery } from '@/lib/connectors/googleNews'
import { hasTopicTargeting } from '@/lib/topicEvents'
import { runTopicPull } from '@/lib/topicPull'

/**
 * Aimed topic ingestion — polls /api/targeted using the project's keywords,
 * entities, and place. Starts quickly after open (or immediately when the
 * project wizard flagged auto-collect); then refreshes on an interval.
 */
const START_DELAY_MS = 1_500
const START_DELAY_AUTO_MS = 400
const POLL_MS = 5 * 60 * 1000
export const ARGUS_AUTO_COLLECT_KEY = 'argus-auto-collect'

/** Prevent overlapping / StrictMode double pulls. */
let pullInFlight = false

function consumeAutoCollectFlag(projectId: string): boolean {
  try {
    const raw = sessionStorage.getItem(ARGUS_AUTO_COLLECT_KEY)
    if (!raw) return false
    const parsed = JSON.parse(raw) as { projectId?: string; at?: number }
    sessionStorage.removeItem(ARGUS_AUTO_COLLECT_KEY)
    if (parsed.projectId && parsed.projectId !== projectId) return false
    // Ignore stale flags older than 2 minutes
    if (parsed.at && Date.now() - parsed.at > 120_000) return false
    return true
  } catch {
    return false
  }
}

export function useTargetedEvents() {
  const project = useProjectStore(s => s.getActiveProject())
  const targeting = project?.targeting
  const anchor = project?.regionCenter
  const query = targeting ? buildNewsQuery(targeting) : ''
  const active = hasTopicTargeting(targeting) && query.length > 0

  useEffect(() => {
    if (!active || !project || !targeting) {
      useMapStore.getState().setTopicPull({ querying: false })
      return
    }

    let cancelled = false
    const pull = async () => {
      if (cancelled || pullInFlight) return
      if (typeof document !== 'undefined' && document.visibilityState === 'hidden') return
      pullInFlight = true
      try {
        await runTopicPull(targeting, anchor, project.countryCodes ?? [], project.researchQuestion)
      } finally {
        pullInFlight = false
      }
    }

    const auto = consumeAutoCollectFlag(project.id)
    const delay = auto ? START_DELAY_AUTO_MS : START_DELAY_MS
    // Brief settle so the map can paint, then collect — not a 25s dead wait.
    const start = window.setTimeout(() => {
      void pull()
      interval = window.setInterval(pull, POLL_MS)
    }, delay)
    let interval: number | undefined

    const onVis = () => {
      if (document.visibilityState === 'visible' && !pullInFlight) void pull()
    }
    document.addEventListener('visibilitychange', onVis)

    return () => {
      cancelled = true
      window.clearTimeout(start)
      if (interval) window.clearInterval(interval)
      document.removeEventListener('visibilitychange', onVis)
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [active, query, project?.id])
}

export { runTopicPull }
