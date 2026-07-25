'use client'
import { useEffect, useRef } from 'react'
import { useWorkspace } from './useWorkspace'
import { useMapStore } from '@/stores/mapStore'
import { useAuth } from '@/lib/auth/AuthContext'

function roundViewport(v: { latitude: number; longitude: number; zoom: number }) {
  return {
    latitude: Math.round(v.latitude * 1e4) / 1e4,
    longitude: Math.round(v.longitude * 1e4) / 1e4,
    zoom: Math.round(v.zoom * 10) / 10,
  }
}

// Restores workspace settings on login, then auto-saves on every relevant store change.
export function useWorkspaceSync() {
  const { isAuthenticated } = useAuth()
  const { workspace, saveWorkspace } = useWorkspace()
  const viewport = useMapStore(s => s.viewport)
  const layers = useMapStore(s => s.layers)
  const eventFilter = useMapStore(s => s.eventFilter)
  const restoredRef = useRef(false)
  const lastSavedRef = useRef('')

  // Restore once when workspace first loads after login
  useEffect(() => {
    if (!workspace || restoredRef.current) return
    const s = (workspace as unknown as { settings?: Record<string, unknown> }).settings
    if (!s) return
    restoredRef.current = true

    if (s.viewport && typeof s.viewport === 'object') {
      const v = s.viewport as { latitude?: number; longitude?: number; zoom?: number }
      useMapStore.getState().flyTo(v.latitude ?? 20, v.longitude ?? 10, v.zoom ?? 2)
    }
    if (s.layers && typeof s.layers === 'object') {
      const savedLayers = s.layers as Record<string, boolean>
      const currentLayers = useMapStore.getState().layers
      for (const key of Object.keys(savedLayers)) {
        if (key in currentLayers && savedLayers[key] !== currentLayers[key as keyof typeof currentLayers]) {
          useMapStore.getState().toggleLayer(key as keyof typeof currentLayers)
        }
      }
    }
    if (typeof s.eventFilter === 'string') useMapStore.getState().setEventFilter(s.eventFilter)
  }, [workspace?.id]) // eslint-disable-line react-hooks/exhaustive-deps

  // Auto-save on change — debounced inside saveWorkspace. Skip no-op / echo updates.
  useEffect(() => {
    if (!isAuthenticated || !workspace?.id || !restoredRef.current) return
    const payload = {
      viewport: roundViewport(viewport),
      layers: {
        events: layers.events,
        cables: layers.cables,
        aviation: layers.aviation,
        vessels: layers.vessels,
        chokepoints: layers.chokepoints,
        disasters: layers.disasters,
        plots: layers.plots,
      },
      eventFilter,
    }
    const key = JSON.stringify(payload)
    if (key === lastSavedRef.current) return
    lastSavedRef.current = key
    saveWorkspace(payload)
  }, [
    isAuthenticated,
    workspace?.id,
    saveWorkspace,
    viewport.latitude,
    viewport.longitude,
    viewport.zoom,
    layers.events,
    layers.cables,
    layers.aviation,
    layers.vessels,
    layers.chokepoints,
    layers.disasters,
    layers.plots,
    eventFilter,
  ])
}
