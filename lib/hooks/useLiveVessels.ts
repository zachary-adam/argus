'use client'
import { useEffect, useRef } from 'react'
import { useMapStore } from '@/stores/mapStore'
import { VesselPosition } from '@/types'

const vesselMap = new Map<string, VesselPosition>()

export function useLiveVessels(enabled: boolean) {
  const coverage = useMapStore(s => s.liveCoverage)
  const esRef = useRef<EventSource | null>(null)
  const reconnectTimer = useRef<ReturnType<typeof setTimeout> | null>(null)
  const mountedRef = useRef(true)
  const retryCount = useRef(0)
  const flushTimer = useRef<ReturnType<typeof setTimeout> | null>(null)
  const dirty = useRef(false)

  // Push to React at most once per 4s — skip entirely when the vessels layer is off
  // so AIS traffic never re-renders the map for an invisible layer.
  const scheduleFlush = () => {
    dirty.current = true
    if (flushTimer.current) return
    flushTimer.current = setTimeout(() => {
      flushTimer.current = null
      if (!dirty.current) return
      dirty.current = false
      if (!useMapStore.getState().layers.vessels) return
      const all = Array.from(vesselMap.values())
      const CAP = 350
      useMapStore.setState({
        vesselPositions: all.length > CAP
          ? all
              .slice()
              .sort((a, b) => Number(b.sanctioned) - Number(a.sanctioned) || (b.speed ?? 0) - (a.speed ?? 0))
              .slice(0, CAP)
          : all,
      })
    }, 4000)
  }

  const flushNow = () => {
    if (!useMapStore.getState().layers.vessels) {
      useMapStore.setState({ vesselPositions: [] })
      return
    }
    const all = Array.from(vesselMap.values())
    const CAP = 350
    useMapStore.setState({
      vesselPositions: all.length > CAP
        ? all
            .slice()
            .sort((a, b) => Number(b.sanctioned) - Number(a.sanctioned) || (b.speed ?? 0) - (a.speed ?? 0))
            .slice(0, CAP)
        : all,
    })
  }

  const connect = () => {
    if (!mountedRef.current || !enabled) return
    if (esRef.current) { esRef.current.close(); esRef.current = null }

    const es = new EventSource(`/api/vessels/stream?coverage=${coverage}`)
    esRef.current = es

    es.onopen = () => { retryCount.current = 0 }

    es.onmessage = (e) => {
      try {
        const msg = JSON.parse(e.data)

        if (msg.type === 'snapshot') {
          vesselMap.clear()
          for (const v of msg.vessels as VesselPosition[]) vesselMap.set(v.mmsi, v)
          dirty.current = false
          flushNow()
        }

        if (msg.type === 'position') {
          vesselMap.set(msg.vessel.mmsi, msg.vessel as VesselPosition)
          scheduleFlush()
        }
      } catch { /* malformed */ }
    }

    es.onerror = () => {
      es.close()
      esRef.current = null
      if (!mountedRef.current) return
      const delay = Math.min(60000, 5000 * Math.pow(2, retryCount.current))
      retryCount.current++
      reconnectTimer.current = setTimeout(connect, delay)
    }
  }

  // Clear React vessel state when the layer is toggled off (module Map keeps AIS warm).
  useEffect(() => {
    const unsub = useMapStore.subscribe((s, prev) => {
      if (s.layers.vessels === prev.layers.vessels) return
      if (!s.layers.vessels) {
        useMapStore.setState({ vesselPositions: [] })
      } else if (vesselMap.size > 0) {
        flushNow()
      }
    })
    return unsub
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  useEffect(() => {
    mountedRef.current = true
    if (!enabled) {
      useMapStore.setState({ vesselPositions: [] })
      return
    }

    const start = () => {
      if (document.visibilityState === 'visible') connect()
    }
    const onVis = () => {
      if (document.visibilityState === 'hidden') {
        esRef.current?.close()
        esRef.current = null
        if (reconnectTimer.current) clearTimeout(reconnectTimer.current)
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
      if (flushTimer.current) clearTimeout(flushTimer.current)
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [enabled, coverage])
}
