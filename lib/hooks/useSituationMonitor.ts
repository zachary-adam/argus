'use client'
import { useEffect, useRef } from 'react'
import { useMapStore } from '@/stores/mapStore'
import { useProjectStore } from '@/stores/projectStore'
import { deriveThreads, type ThreadEvent } from '@/lib/threads'
import { deriveAllDossiers, type ActorEvent } from '@/lib/actors'
import { detectSignals, type MonitorState, type MonitorSignal, type MonitorSeverity } from '@/lib/monitor'

const CHECK_MS = 90 * 1000  // re-derive + diff every 90s (rides the 2-min pull)

// A monitor signal is worth a desktop notification only at high/critical — the
// medium actor-spikes stay in-app so we don't nag the analyst's OS.
function shouldPushDesktop(sev: MonitorSeverity): boolean {
  return sev === 'critical' || sev === 'high'
}

/**
 * Continuous situation monitor. While the workspace is open (even backgrounded),
 * it periodically re-derives threads + actor dossiers from the live corpus,
 * diffs against the last snapshot, and turns real CHANGES into alerts: an in-app
 * toast + the monitor log always, plus a desktop notification for high/critical.
 * This is what makes ARGUS page the analyst instead of waiting to be checked.
 */
export function useSituationMonitor() {
  const addMonitorSignals = useMapStore(s => s.addMonitorSignals)
  const pushToast = useMapStore(s => s.pushToast)
  const stateRef = useRef<MonitorState | null>(null)
  const projectRef = useRef<string | null>(null)

  useEffect(() => {
    let cancelled = false

    const check = () => {
      if (cancelled) return
      // Same pattern as live feeds: don't burn CPU while the tab is backgrounded.
      if (typeof document !== 'undefined' && document.visibilityState === 'hidden') return
      const project = useProjectStore.getState().getActiveProject()
      const events = useMapStore.getState().events
      if (!project) return

      // Reset the baseline when the analyst switches projects — otherwise the
      // first check on a new project would fire signals for its whole backlog.
      if (projectRef.current !== project.id) {
        projectRef.current = project.id
        stateRef.current = null
      }

      const threads = deriveThreads(events as unknown as ThreadEvent[], project.trackedActors ?? [])
      const dossiers = deriveAllDossiers(project.trackedActors ?? [], events as unknown as ActorEvent[])
      const { signals, next } = detectSignals(stateRef.current, { threads, dossiers, forecasts: project.forecasts })
      stateRef.current = next

      if (signals.length === 0) return
      // Only toast/notify the genuinely NEW signals — forecast-due re-emits every
      // tick, but the store returns just the freshly-logged ones.
      const fresh = addMonitorSignals(signals)
      for (const sig of fresh) {
        const toastTitle = sig.threadLabel ?? sig.actorName ?? sig.title
        pushToast({
          title: toastTitle,
          body: `${sig.title} — ${sig.detail}`,
          severity: sig.severity === 'critical' ? 'critical' : sig.severity === 'high' ? 'high' : 'medium',
          type: 'system',
          eventId: sig.eventIds?.[0],
        })
        if (shouldPushDesktop(sig.severity) && typeof Notification !== 'undefined' && Notification.permission === 'granted') {
          try {
            new Notification(`ARGUS — ${sig.title}`, {
              body: sig.detail,
              icon: '/favicon.ico',
              tag: sig.id,
              requireInteraction: sig.severity === 'critical',
            })
          } catch { /* notification API can throw when backgrounded on some browsers */ }
        }
      }
    }

    // First tick establishes the baseline (no signals); subsequent ticks diff.
    const t = setInterval(check, CHECK_MS)
    const warmup = setTimeout(check, 8000) // let the initial pull/seed land first
    return () => { cancelled = true; clearInterval(t); clearTimeout(warmup) }
  }, [addMonitorSignals, pushToast])
}

export type { MonitorSignal }
