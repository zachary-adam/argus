'use client'
import { useQuery } from '@tanstack/react-query'
import { useEffect, useState } from 'react'
import { useMapStore } from '@/stores/mapStore'
import type { AircraftPosition } from '@/types'

function useTabVisible() {
  const [visible, setVisible] = useState(
    () => typeof document === 'undefined' || document.visibilityState === 'visible',
  )
  useEffect(() => {
    const onVis = () => setVisible(document.visibilityState === 'visible')
    document.addEventListener('visibilitychange', onVis)
    return () => document.removeEventListener('visibilitychange', onVis)
  }, [])
  return visible
}

/** Shared aviation poll — one React Query cache for map + layer counts. */
export function useLiveAviation(enabled: boolean) {
  const liveCoverage = useMapStore(s => s.liveCoverage)
  const tabVisible = useTabVisible()

  return useQuery<AircraftPosition[]>({
    queryKey: ['aviation', liveCoverage],
    queryFn: () => fetch(`/api/aviation?scope=${liveCoverage}`).then(r => r.json()),
    refetchInterval: tabVisible ? 90_000 : false,
    enabled: enabled && tabVisible,
    staleTime: 80_000,
  })
}
