'use client'
import { useEffect, useRef } from 'react'
import { useMapStore } from '@/stores/mapStore'
import { AnomalyAlert } from '@/types'

const POLL_INTERVAL = 5 * 60 * 1000  // poll every 5 minutes

export function useAnomalyAlerts() {
  const pushToast = useMapStore(s => s.pushToast)
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  // useRef so firedIds resets on unmount/remount (new session), not shared across instances
  const firedIds = useRef(new Set<string>())

  useEffect(() => {
    async function check() {
      if (typeof document !== 'undefined' && document.visibilityState === 'hidden') {
        timerRef.current = setTimeout(check, POLL_INTERVAL)
        return
      }
      try {
        const res = await fetch('/api/anomalies')
        if (!res.ok) return
        const anomalies: AnomalyAlert[] = await res.json()

        for (const a of anomalies) {
          if (firedIds.current.has(a.id)) continue
          firedIds.current.add(a.id)

          // Use severity already computed by the engine (Z≥3 = critical, Z≥2 = high)
          // rather than re-deriving with a different threshold here
          pushToast({
            title: `Statistical Anomaly — ${a.country}`,
            body: `${a.category} event rate is ${a.zScore.toFixed(1)}σ above the 30-day baseline (${a.observed} observed vs ${a.expected} expected).`,
            severity: a.severity,
            type: 'correlation',
          })
        }
      } catch { /* non-fatal */ }

      timerRef.current = setTimeout(check, POLL_INTERVAL)
    }

    check()
    return () => {
      if (timerRef.current) clearTimeout(timerRef.current)
    }
  }, [pushToast])
}
