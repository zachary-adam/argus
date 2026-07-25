'use client'
import { useEffect, useMemo, useRef } from 'react'
import { useProjectStore } from '@/stores/projectStore'
import { usePlotsStore } from '@/stores/plotsStore'
import { plotsForProject } from '@/lib/plotScope'
import type { Plot } from '@/types'

/** Merge persisted project.plots into the live store when the active project changes. */
export function useProjectPlotsHydration() {
  const project = useProjectStore(s => s.getActiveProject())
  const addPlot = usePlotsStore(s => s.addPlot)
  const lastProjectId = useRef<string | null>(null)

  useEffect(() => {
    const pid = project?.id
    if (!pid || lastProjectId.current === pid) return
    lastProjectId.current = pid
    const existing = new Set(usePlotsStore.getState().plots.map(p => p.id))
    for (const plot of project.plots ?? []) {
      if (!existing.has(plot.id)) addPlot(plot)
    }
  }, [project?.id, project?.plots, addPlot])
}

export function useScopedPlots(): Plot[] {
  const projectId = useProjectStore(s => s.activeProjectId)
  const plots = usePlotsStore(s => s.plots)
  return useMemo(() => plotsForProject(plots, projectId), [plots, projectId])
}
