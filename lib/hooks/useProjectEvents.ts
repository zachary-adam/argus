'use client'
import { useEffect, useRef, useCallback } from 'react'
import { useMapStore } from '@/stores/mapStore'
import { useProjectStore } from '@/stores/projectStore'
import { IntelEvent } from '@/types'
import { haversineDistance } from '@/lib/haversine'
import { isDuplicate, deduplicateIncoming } from '@/lib/dedup'
import { universalToIntel, isEventFilterExempt } from '@/lib/eventPersist'
import { filterIntelByRetention, DEFAULT_LIVE_FEED_RETENTION, stampIngested, repairProjectEventRetention, RETENTION_PRUNE_INTERVAL_MS } from '@/lib/eventRetention'
import { refineAimedEventsClient } from '@/lib/refineAimedEventsClient'
import { evaluateWatchRules } from '@/lib/watchEngine'
import { displayCountry } from '@/lib/countryNames'
import { classifyInfoOps } from '@/lib/infoOps'
import { effectiveTargeting, isSituationRelevant } from '@/lib/relevance'
import { gateBySemanticRelevance } from '@/lib/relevanceClient'
import { getDeepRelevanceFilter } from '@/lib/relevanceMode'

async function filterByMission(
  events: IntelEvent[],
  project: { targeting?: import('@/types/project').Targeting; countryCodes?: string[]; researchQuestion?: string; goalTemplateId?: string },
): Promise<IntelEvent[]> {
  const ctx = {
    targeting: effectiveTargeting(project),
    countryCodes: project.countryCodes,
    researchQuestion: project.researchQuestion,
  }
  if (getDeepRelevanceFilter()) {
    return gateBySemanticRelevance(events, ctx)
  }
  return events.filter(e => isSituationRelevant(e, ctx.targeting, ctx.countryCodes))
}

// Normalize a single event: expand 2-letter country codes to full names, and
// tag fact-check/social-share noise as info-ops (so it's quarantined from
// alerts/risk and surfaced under the "Disinfo" filter rather than deleted).
const normCountry = (e: IntelEvent): IntelEvent => {
  let out = e.country && /^[A-Za-z]{2}$/.test(e.country) ? { ...e, country: displayCountry(e.country) } : e
  if (out.infoOps === undefined) {
    const io = classifyInfoOps(out)
    out = out === e ? { ...e } : out
    out.infoOps = io.infoOps
    out.infoOpsReason = io.reason
  }
  return out
}

// Re-export for callers that already import from this hook module.
export { universalToIntel, isEventFilterExempt } from '@/lib/eventPersist'

// km radius based on zoom level
function zoomToRadius(zoom: number): number {
  if (zoom >= 8) return 150
  if (zoom >= 6) return 400
  if (zoom >= 5) return 700
  if (zoom >= 4) return 1400
  if (zoom >= 3) return 2500
  return 5000
}

function filterByRegion(events: IntelEvent[], centerLon: number, centerLat: number, zoom: number): IntelEvent[] {
  const radius = zoomToRadius(zoom)
  return events.filter(e => haversineDistance(centerLat, centerLon, e.lat, e.lon) <= radius)
}

const notifiedIds = new Set<string>()

function pushNotification(event: IntelEvent) {
  if (typeof Notification === 'undefined' || Notification.permission !== 'granted') return
  if (notifiedIds.has(event.id)) return
  notifiedIds.add(event.id)
  // Prevent unbounded growth during long sessions
  if (notifiedIds.size > 500) {
    const first = notifiedIds.values().next().value
    if (first) notifiedIds.delete(first)
  }
  new Notification(`${event.severity.toUpperCase()} — ${event.country}`, {
    body: event.title,
    icon: '/favicon.ico',
    tag: event.id,
    requireInteraction: event.severity === 'critical',
  })
}

export function useProjectEvents() {
  const { setEvents, setAlerts, setSituations, setLiveStatus, setEventsLoading } = useMapStore()
  const { getActiveProject, activeProjectId, updateWatchRule, createIncident, updateEvent, pruneExpiredEvents, updateProject } = useProjectStore()

  const fireRules = useCallback((events: IntelEvent[]) => {
    const project = getActiveProject()
    if (!project?.watchRules?.length) return
    const ctx = { targeting: project.targeting, countryCodes: project.countryCodes ?? [] }
    const fired = evaluateWatchRules(events, project.watchRules, ctx)
    const topicFired = fired.filter(f => f.rule.eventScope === 'topic')
    const otherFired = fired.filter(f => f.rule.eventScope !== 'topic')

    if (topicFired.length > 0) {
      const eventIds = new Set(topicFired.flatMap(f => f.matchingEvents.map(e => e.id)))
      const terms = topicFired.map(f => f.rule.name.replace(/^Topic:\s*/i, '')).join(', ')
      useMapStore.getState().pushToast({
        title: 'Topic watch',
        body: `${eventIds.size} on-beat event${eventIds.size !== 1 ? 's' : ''} (${terms})`,
        severity: 'medium',
        type: 'watch-rule',
        eventId: topicFired[0].matchingEvents[0]?.id,
      })
      for (const { rule } of topicFired) {
        updateWatchRule(project.id, rule.id, {
          lastFiredAt: new Date().toISOString(),
          fireCount: rule.fireCount + 1,
        })
      }
    }

    for (const { rule, matchingEvents } of otherFired) {
      const now = new Date().toISOString()
      const summary = `${matchingEvents.length} event${matchingEvents.length !== 1 ? 's' : ''} matched in the last ${rule.windowHours}h`
      updateWatchRule(project.id, rule.id, {
        lastFiredAt: now,
        fireCount: rule.fireCount + 1,
      })
      useMapStore.getState().pushToast({
        title: `Watch Rule: ${rule.name}`,
        body: summary,
        severity: rule.incidentSeverity === 'low' ? 'info' : rule.incidentSeverity,
        type: 'watch-rule',
        ruleId: rule.id,
      })
      if ((rule.action === 'notify' || rule.action === 'both') &&
          typeof Notification !== 'undefined' && Notification.permission === 'granted') {
        new Notification(`ARGUS Watch: ${rule.name}`, {
          body: summary,
          icon: '/favicon.ico',
          tag: `watch-${rule.id}`,
          requireInteraction: rule.incidentSeverity === 'critical',
        })
      }
      if (rule.action === 'incident' || rule.action === 'both') {
        const topEvent = matchingEvents[0]
        createIncident(project.id, {
          title: rule.name,
          summary: `Watch rule triggered: ${matchingEvents.length} matching event${matchingEvents.length !== 1 ? 's' : ''} — ${topEvent?.title ?? ''}`,
          stage: 'monitoring',
          severity: rule.incidentSeverity,
          country: topEvent?.country ?? '',
          category: topEvent?.category ?? 'political',
          linkedEventIds: matchingEvents.slice(0, 10).map(e => e.id),
          tags: ['watch-rule', rule.name.toLowerCase().replace(/\s+/g, '-')],
        })
      }
    }
  }, [getActiveProject, updateWatchRule, createIncident])

  const applyRetention = useCallback((events: IntelEvent[]): IntelEvent[] => {
    const retention = getActiveProject()?.liveFeedRetention ?? DEFAULT_LIVE_FEED_RETENTION
    return filterIntelByRetention(events, retention)
  }, [getActiveProject])

  // Seed map store when the active project changes — clear bleed from prior project,
  // then show keyword-filtered persisted events while semantic gate runs in background.
  useEffect(() => {
    if (!activeProjectId) return
    const project = getActiveProject()
    if (!project || project.id !== activeProjectId) return

    const repaired = repairProjectEventRetention(project)
    if (repaired) updateProject(project.id, { events: repaired })

    pruneExpiredEvents(project.id)
    const freshProject = getActiveProject()
    if (!freshProject || freshProject.id !== activeProjectId) return

    setAlerts([])
    setSituations([])

    if (freshProject.events.length === 0) {
      setEvents([])
      setEventsLoading(true)
      return
    }

    const deletedIds = new Set(freshProject.deletedEventIds ?? [])
    const isExempt = isEventFilterExempt
    const ctx = {
      targeting: effectiveTargeting(freshProject),
      countryCodes: freshProject.countryCodes,
      researchQuestion: freshProject.researchQuestion,
    }
    const anchorPt = { lat: freshProject.regionCenter[1], lon: freshProject.regionCenter[0] }
    const baseMapped = freshProject.events
      .filter(e => !deletedIds.has(e.id))
      .map(universalToIntel)
    const mapped = refineAimedEventsClient({
      events: baseMapped,
      anchor: anchorPt,
      geocode: false,
      project: freshProject,
      updateEvent,
    })
    // Sync gazetteer spread — show immediately; geocode runs below.
    void mapped.then(refined => {
      const exempt = refined.filter(isExempt)
      const rest = refined.filter(e => !isExempt(e))
      const keywordKept = rest.filter(e =>
        isSituationRelevant(e, ctx.targeting, ctx.countryCodes),
      )
      const fastIntel = applyRetention([...exempt, ...keywordKept].map(normCountry))
      setEvents(fastIntel)
      setEventsLoading(false)

      void (async () => {
        const geocoded = await refineAimedEventsClient({
          events: refined,
          anchor: anchorPt,
          geocode: true,
          project: getActiveProject() ?? freshProject,
          updateEvent,
        })
        const kept = await filterByMission(geocoded.filter(e => !isExempt(e)), freshProject)
        const intel = applyRetention([...geocoded.filter(isExempt), ...kept].map(normCountry))
        if (intel.length !== fastIntel.length || intel.some((e, i) => e.id !== fastIntel[i]?.id)) {
          setEvents(intel)
        } else {
          // Coords may have moved without changing membership — refresh pins.
          const coordsMoved = intel.some((e, i) =>
            e.lat !== fastIntel[i]?.lat || e.lon !== fastIntel[i]?.lon,
          )
          if (coordsMoved) setEvents(intel)
        }
        fireRules(intel)
        window.setTimeout(() => {
          fetch('/api/correlations', {
            method: 'POST', headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ events: intel, settings: freshProject.correlationSettings }),
          }).then(r => r.json()).then(setAlerts).catch(() => {})
          fetch('/api/situations', {
            method: 'POST', headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ events: intel }),
          }).then(r => r.json()).then(setSituations).catch(() => {})
        }, 2000)
      })()
    })
  }, [activeProjectId]) // eslint-disable-line react-hooks/exhaustive-deps

  const esRef = useRef<EventSource | null>(null)
  const reconnectTimer = useRef<ReturnType<typeof setTimeout> | null>(null)
  const mountedRef = useRef(true)
  const retryCount = useRef(0)
  const corrCooldownRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const corrPendingRef = useRef(false)
  const pendingEvtsRef = useRef<IntelEvent[]>([])
  const batchTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const batchIncomingRef = useRef<IntelEvent[]>([])

  const doCorrelate = useCallback(async () => {
    const latest = pendingEvtsRef.current
    if (latest.length === 0) return
    try {
      const projSettings = getActiveProject()?.correlationSettings
      const [corrRes, sitRes] = await Promise.all([
        fetch('/api/correlations', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ events: latest, settings: projSettings }) }),
        fetch('/api/situations', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ events: latest }) }),
      ])
      const [corrs, sits] = await Promise.all([corrRes.json(), sitRes.json()])
      setAlerts(corrs)
      setSituations(sits)
    } catch { /* non-fatal */ }
  }, [setAlerts, setSituations, getActiveProject])

  const runCorrelations = useCallback((evts: IntelEvent[]) => {
    if (evts.length === 0) return
    // Always keep the latest event set in ref so the trailing flush uses fresh data
    pendingEvtsRef.current = evts
    // Leading-edge throttle: run the first batch immediately so critical alerts
    // aren't delayed, then enforce a 60s cooldown (with a single trailing flush
    // for events that arrived during the window) to avoid hammering the AI API.
    if (corrCooldownRef.current) { corrPendingRef.current = true; return }
    const startCooldown = () => {
      corrCooldownRef.current = setTimeout(() => {
        corrCooldownRef.current = null
        if (corrPendingRef.current) {
          corrPendingRef.current = false
          void doCorrelate()
          startCooldown()
        }
      }, 60000)
    }
    void doCorrelate()
    startCooldown()
  }, [doCorrelate])

  const applyFilter = useCallback(async (events: IntelEvent[]): Promise<IntelEvent[]> => {
    const project = getActiveProject()
    if (!project) return events
    // Aimed/analyst events were explicitly requested for this project — never
    // region- or source-filtered (a town-level result must survive even if it
    // sits outside the project's region box).
    const isExempt = isEventFilterExempt
    const exempt = events.filter(isExempt)
    const rest = events.filter(e => !isExempt(e))

    const [lon, lat] = project.regionCenter
    let out = filterByRegion(rest, lon, lat, project.regionZoom)
    // Honor the project's source toggles: drop events from connectors the analyst
    // disabled. (The live feed is global/shared; this is where per-project source
    // selection is actually applied so the toggles aren't cosmetic.)
    const disabled = new Set((project.connectors ?? []).filter(c => !c.enabled).map(c => c.id))
    if (disabled.size) out = out.filter(e => !disabled.has(e.source))
    // Relevance gate — keyword-only by default; opt-in deep semantic filter in Settings.
    const kept = await filterByMission(out, project)
    // Expand 2-letter country codes to full names ONCE here, so the feed, alerts,
    // correlation (posted from the store), velocity, actors and AI all read names.
    return [...exempt, ...kept].map(normCountry)
  }, [getActiveProject])

  const connect = useCallback(() => {
    if (!mountedRef.current) return
    if (esRef.current) { esRef.current.close(); esRef.current = null }

    setLiveStatus('reconnecting')
    const es = new EventSource('/api/events/stream')
    esRef.current = es

    es.onopen = () => {
      retryCount.current = 0
      setLiveStatus('connected')
    }

    es.onmessage = (e) => {
      try {
        const msg = JSON.parse(e.data)

        // IDs the analyst has permanently deleted — never re-add these
        const deletedIds = new Set(getActiveProject()?.deletedEventIds ?? [])

        if (msg.type === 'snapshot') {
          void (async () => {
          const filtered = applyRetention((await applyFilter(msg.events)).filter((ev: IntelEvent) => !deletedIds.has(ev.id)).map(stampIngested))
          // Merge with existing project-seeded events — don't wipe body-rich user-added events
          const current = applyRetention(useMapStore.getState().events)
          if (current.length === 0) {
            setEvents(filtered)
            runCorrelations(filtered)
            fireRules(filtered)
          } else {
            // Content-based dedup, not just id: source ids embed Date.now(), so the
            // same article re-fetched in a later snapshot (e.g. on SSE reconnect) has
            // a NEW id. An id-only check would re-add it every time and duplicates
            // would pile up. deduplicateIncoming also matches title+geo+time.
            const fresh = deduplicateIncoming(filtered, current)
            const merged = applyRetention([...current, ...fresh])
            setEvents(merged)
            runCorrelations(merged)
            fireRules(merged)
          }
          setEventsLoading(false)
          })()
        }

        if (msg.type === 'new') {
          void (async () => {
          const incoming: IntelEvent[] = (await applyFilter(msg.events)).filter((ev: IntelEvent) => !deletedIds.has(ev.id)).map(stampIngested)

          // Notifications are immediate — don't batch these
          incoming
            .filter(ev => ev.severity === 'critical' || ev.severity === 'high')
            .forEach(ev => {
              pushNotification(ev)
              if (ev.severity === 'critical') {
                useMapStore.getState().pushToast({
                  title: `Critical: ${ev.country}`,
                  body: ev.title,
                  severity: 'critical',
                  type: 'critical-event',
                  eventId: ev.id,
                })
              }
            })

          // Buffer events for a 100ms batched store write — reduces re-renders when
          // multiple `new` messages arrive in quick succession (e.g. on reconnect)
          batchIncomingRef.current.push(...incoming)
          if (batchTimerRef.current) clearTimeout(batchTimerRef.current)
          batchTimerRef.current = setTimeout(() => {
            batchTimerRef.current = null
            const buffered = batchIncomingRef.current
            batchIncomingRef.current = []
            if (buffered.length === 0) return
            const current = applyRetention(useMapStore.getState().events)
            const existingIds = new Set(current.map(ev => ev.id))
            const fresh = buffered.filter(ev => !existingIds.has(ev.id) && !isDuplicate(ev, current))
            if (fresh.length === 0) return
            const merged = applyRetention([...fresh, ...current])
            setEvents(merged)
            runCorrelations(merged)
            fireRules(merged)
          }, 100)
          })()
        }
      } catch { /* malformed */ }
    }

    es.onerror = () => {
      es.close()
      esRef.current = null
      if (!mountedRef.current) return
      setLiveStatus('reconnecting')
      const delay = Math.min(60000, 5000 * Math.pow(2, retryCount.current))
      retryCount.current++
      reconnectTimer.current = setTimeout(connect, delay)
    }
  }, [setEvents, setEventsLoading, setLiveStatus, runCorrelations, applyFilter, applyRetention, fireRules, getActiveProject])

  // Drop expired live / ephemeral-RSS events from the working map
  useEffect(() => {
    const tick = () => {
      const current = useMapStore.getState().events
      const pruned = applyRetention(current)
      if (pruned.length !== current.length) setEvents(pruned)
      const pid = getActiveProject()?.id
      if (pid) pruneExpiredEvents(pid)
    }
    tick()
    const id = window.setInterval(tick, RETENTION_PRUNE_INTERVAL_MS)
    return () => window.clearInterval(id)
  }, [activeProjectId, applyRetention, setEvents, getActiveProject, pruneExpiredEvents])

  useEffect(() => {
    mountedRef.current = true
    if (typeof Notification !== 'undefined' && Notification.permission === 'default') {
      Notification.requestPermission().catch(() => {})
    }

    const start = () => {
      if (document.visibilityState === 'visible') connect()
    }
    const onVis = () => {
      if (document.visibilityState === 'hidden') {
        esRef.current?.close()
        esRef.current = null
        if (reconnectTimer.current) clearTimeout(reconnectTimer.current)
        setLiveStatus('disconnected')
      } else {
        start()
      }
    }

    start()
    document.addEventListener('visibilitychange', onVis)
    return () => {
      mountedRef.current = false
      document.removeEventListener('visibilitychange', onVis)
      esRef.current?.close()
      if (reconnectTimer.current) clearTimeout(reconnectTimer.current)
      if (corrCooldownRef.current) clearTimeout(corrCooldownRef.current)
      if (batchTimerRef.current) clearTimeout(batchTimerRef.current)
      setLiveStatus('disconnected')
    }
  }, [connect, setLiveStatus])
}
