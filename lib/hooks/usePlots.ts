'use client'
import { useEffect, useCallback } from 'react'
import { useAuth } from '@/lib/auth/AuthContext'
import { usePlotsStore } from '@/stores/plotsStore'
import { mergePlotsFromApi, mirrorPlotToProject, mirrorPlotRemoveFromProject } from '@/lib/plotPersist'
import { IS_CLOUD_MODE } from '@/lib/supabase/config'
import { Plot } from '@/types'

export function usePlots(workspaceId: string | undefined) {
  const { isAuthenticated } = useAuth()
  const { plots, setPlots, addPlot, updatePlot, removePlot } = usePlotsStore()

  const apiEnabled = IS_CLOUD_MODE ? isAuthenticated : true

  useEffect(() => {
    if (!apiEnabled) return
    const ctrl = new AbortController()
    fetch('/api/plots', { signal: ctrl.signal })
      .then(r => r.ok ? r.json() : null)
      .then((data: Plot[] | null) => {
        if (!data) return
        const merged = mergePlotsFromApi(data, usePlotsStore.getState().plots)
        setPlots(merged)
      })
      .catch(() => {})
    return () => ctrl.abort()
  }, [apiEnabled, setPlots])

  const createPlot = useCallback(async (
    type: Plot['type'],
    coordinates: Plot['coordinates'],
    label: string,
    properties: Plot['properties'] = {},
  ) => {
    if (!apiEnabled) return null
    const res = await fetch('/api/plots', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ type, coordinates, label, properties, workspaceId }),
    }).catch(() => null)
    if (!res?.ok) return null
    const plot: Plot = await res.json()
    addPlot(plot)
    mirrorPlotToProject(plot)
    return plot
  }, [apiEnabled, workspaceId, addPlot])

  const updatePlotProps = useCallback(async (id: string, label: string, properties: Plot['properties']) => {
    const current = usePlotsStore.getState().plots.find(p => p.id === id)
    const next = current ? { ...current, label, properties } : null
    updatePlot(id, { label, properties })
    if (next) mirrorPlotToProject(next)
    if (!id.startsWith('local_')) {
      const res = await fetch('/api/plots', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id, label, properties }),
      }).catch(() => null)
      if (res?.ok) {
        const updated: Plot = await res.json()
        updatePlot(id, updated)
        mirrorPlotToProject(updated)
      }
    }
  }, [updatePlot])

  const deletePlot = useCallback(async (id: string) => {
    const projectId = plotProjectIdFromStore(id)
    if (!id.startsWith('local_')) {
      await fetch('/api/plots', {
        method: 'DELETE',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id }),
      }).catch(() => {})
    }
    removePlot(id)
    mirrorPlotRemoveFromProject(id, projectId)
  }, [removePlot])

  return { plots, createPlot, updatePlotProps, deletePlot }
}

function plotProjectIdFromStore(plotId: string): string | undefined {
  const plot = usePlotsStore.getState().plots.find(p => p.id === plotId)
  return plot?.properties?.projectId
}
