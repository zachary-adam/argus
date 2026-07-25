import type { IntelEvent } from '@/types'
import type { Targeting } from '@/types/project'
import { useMapStore } from '@/stores/mapStore'
import { buildNewsQuery } from '@/lib/connectors/googleNews'
import { collapseAimedStories } from '@/lib/aimedIngest'
import { refineAimedEventsClient } from '@/lib/refineAimedEventsClient'
import { persistIntelEventsIfMissing } from '@/lib/eventPersist'
import { applyKeepToIntel, DEFAULT_AIMED_PULL_RETENTION } from '@/lib/eventRetention'
import { useProjectStore } from '@/stores/projectStore'

export interface TopicPullResult {
  ok: boolean
  count: number
  filtered?: number
  error?: string
}

/** Client-side aimed pull — replaces prior auto-aimed events, keeps user-pasted. */
export async function runTopicPull(
  targeting: Targeting,
  anchor?: [number, number],
  countryCodes: string[] = [],
  researchQuestion?: string,
): Promise<TopicPullResult> {
  const query = buildNewsQuery(targeting)
  if (!query) {
    return { ok: false, count: 0, error: 'Add keywords, entities, or a place to aim search' }
  }

  useMapStore.getState().setTopicPull({ querying: true, error: null })
  try {
    // Tracked actors ride along so entity lenses expand to alias OR-groups —
    // including native-script aliases (তৃণমূল) against regional editions.
    const trackedActors = (useProjectStore.getState().getActiveProject()?.trackedActors ?? [])
      .map(a => ({ name: a.name, aliases: a.aliases }))
    const res = await fetch('/api/targeted', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ targeting, anchor, countryCodes, researchQuestion, trackedActors }),
    })
    const webWarn = res.headers.get('X-Argus-Warning')
    if (!res.ok) {
      const err = (await res.json().catch(() => ({}))) as { error?: string }
      const message = err.error ?? `Pull failed (${res.status})`
      useMapStore.getState().setTopicPull({
        querying: false,
        error: message,
        lastAt: new Date().toISOString(),
      })
      return { ok: false, count: 0, error: message }
    }

    const raw = (await res.json()) as IntelEvent[]
    if (!Array.isArray(raw)) {
      useMapStore.getState().setTopicPull({ querying: false, error: 'Invalid response' })
      return { ok: false, count: 0, error: 'Invalid response' }
    }

    // The route already applied the relevance brain (semantic) or the substring
    // fallback, and deduped. Re-running the substring gate here would undo the
    // semantic ranking, so only do a light dedup pass for safety.
    const events = collapseAimedStories(raw)
    const filtered = raw.length - events.length

    const anchorPt = anchor ? { lat: anchor[1], lon: anchor[0] } : undefined
    const project = useProjectStore.getState().getActiveProject()
    const refined = await refineAimedEventsClient({
      events,
      anchor: anchorPt,
      geocode: true,
      project,
      updateEvent: useProjectStore.getState().updateEvent,
    })

    const st = useMapStore.getState()
    // Merge — don't wipe prior aimed stories on every re-pull (niche beats need memory).
    const nonAimed = st.events.filter(e => !e.tags?.includes('aimed-pull'))
    const priorAimed = st.events.filter(e => e.tags?.includes('aimed-pull'))
    const aimedKeep = DEFAULT_AIMED_PULL_RETENTION
    const incoming = refined.map(e => applyKeepToIntel(e, aimedKeep))
    const mergedAimed = collapseAimedStories([...incoming, ...priorAimed]).slice(0, 140)
    st.setEvents([...nonAimed, ...mergedAimed])

    const projectAfterRefine = useProjectStore.getState().getActiveProject()
    if (projectAfterRefine && refined.length > 0) {
      persistIntelEventsIfMissing(
        projectAfterRefine,
        refined.slice(0, 100),
        useProjectStore.getState().addEvents,
        useProjectStore.getState().updateEvent,
        { keepDuration: aimedKeep },
      )
    }

    useMapStore.getState().setTopicPull({
      querying: false,
      error: webWarn || null,
      lastAt: new Date().toISOString(),
      aimedCount: refined.length,
      query,
    })
    return { ok: true, count: refined.length, filtered, ...(webWarn ? { error: webWarn } : {}) }
  } catch {
    const message = 'Network error during topic pull'
    useMapStore.getState().setTopicPull({
      querying: false,
      error: message,
      lastAt: new Date().toISOString(),
    })
    return { ok: false, count: 0, error: message }
  }
}
