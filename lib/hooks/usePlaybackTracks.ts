'use client'
import { useEffect, useRef } from 'react'
import { useQueryClient } from '@tanstack/react-query'
import { useMapStore } from '@/stores/mapStore'
import { nearestSnapshot, type TrackSnapshot } from '@/lib/playbackSnapshots'
import type { AircraftPosition } from '@/types'

const MAX_SNAPSHOTS = 24
const SNAPSHOT_INTERVAL_MS = 5 * 60 * 1000

export function usePlaybackTracks() {
  const playback              = useMapStore(s => s.playback)
  const setHistoricalVessels  = useMapStore(s => s.setHistoricalVessels)
  const setHistoricalAircraft = useMapStore(s => s.setHistoricalAircraft)
  const setTrackTimestamps    = useMapStore(s => s.setTrackTimestamps)
  const snapshots             = useRef<TrackSnapshot[]>([])
  const queryClient           = useQueryClient()

  // Periodic vessel + aviation snapshot (ring buffer ~2h).
  // Reuse React Query aviation cache — never hit /api/aviation a second time.
  useEffect(() => {
    const take = () => {
      if (typeof document !== 'undefined' && document.visibilityState === 'hidden') return
      const { vesselPositions, liveCoverage, liveTrackingCaps, layers } = useMapStore.getState()
      const aircraft = (liveTrackingCaps.aviation && layers.aviation)
        ? (queryClient.getQueryData<AircraftPosition[]>(['aviation', liveCoverage]) ?? [])
        : []
      if (vesselPositions.length === 0 && aircraft.length === 0) return
      const ts = new Date().toISOString()
      snapshots.current = [
        ...snapshots.current.slice(-(MAX_SNAPSHOTS - 1)),
        { ts, vessels: vesselPositions, aircraft },
      ]
      setTrackTimestamps({
        vessels: snapshots.current.map(s => s.ts),
        aircraft: snapshots.current.map(s => s.ts),
      })
    }

    take()
    const timer = setInterval(take, SNAPSHOT_INTERVAL_MS)
    return () => clearInterval(timer)
  }, [queryClient, setTrackTimestamps])

  // When scrubber moves, show nearest historical tracks (hide live layer)
  useEffect(() => {
    if (!playback.active || !playback.time) {
      setHistoricalVessels([])
      setHistoricalAircraft([])
      return
    }
    const nearest = nearestSnapshot(snapshots.current, playback.time)
    setHistoricalVessels(nearest?.vessels ?? [])
    setHistoricalAircraft(nearest?.aircraft ?? [])
  }, [playback.active, playback.time, setHistoricalVessels, setHistoricalAircraft])
}
