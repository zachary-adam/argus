import { useProjectStore } from '@/stores/projectStore'
import { usePlotsStore } from '@/stores/plotsStore'
import { plotProjectId } from '@/lib/plotScope'
import type { Plot } from '@/types'

function plotsEqual(a: Plot, b: Plot): boolean {
  return JSON.stringify(a) === JSON.stringify(b)
}

/**
 * Mirror plots into project.plots — the durable source of truth for project
 * sync — in a single store update. Projects whose mirrored plots are already
 * up to date are left untouched (no updatedAt bump, no cloud re-sync).
 */
export function mirrorPlotsToProjects(plots: Plot[]): void {
  const byProject = new Map<string, Plot[]>()
  for (const plot of plots) {
    const projectId = plotProjectId(plot)
    if (!projectId) continue
    const list = byProject.get(projectId) ?? []
    list.push(plot)
    byProject.set(projectId, list)
  }
  if (byProject.size === 0) return

  useProjectStore.setState(s => {
    let anyChanged = false
    const projects = s.projects.map(project => {
      const incoming = byProject.get(project.id)
      if (!incoming) return project

      let nextPlots = project.plots ?? []
      let changed = false
      for (const plot of incoming) {
        const existing = nextPlots.find(p => p.id === plot.id)
        if (!existing) {
          nextPlots = [...nextPlots, plot]
          changed = true
        } else if (!plotsEqual(existing, plot)) {
          nextPlots = nextPlots.map(p => (p.id === plot.id ? plot : p))
          changed = true
        }
      }
      if (!changed) return project

      anyChanged = true
      return { ...project, plots: nextPlots, updatedAt: new Date().toISOString() }
    })
    return anyChanged ? { projects } : s
  })
}

export function mirrorPlotToProject(plot: Plot): void {
  mirrorPlotsToProjects([plot])
}

export function mirrorPlotRemoveFromProject(plotId: string, projectId?: string | null): void {
  const pid = projectId ?? plotProjectId(usePlotsStore.getState().plots.find(p => p.id === plotId) ?? {} as Plot)
  if (!pid) return
  useProjectStore.getState().removePlot(pid, plotId)
}

/** Merge API plots into the live store and project JSON without dropping local-only plots. */
export function mergePlotsFromApi(incoming: Plot[], existing: Plot[]): Plot[] {
  const byId = new Map(existing.map(p => [p.id, p]))
  for (const plot of incoming) {
    byId.set(plot.id, plot)
  }
  mirrorPlotsToProjects(incoming)
  return [...byId.values()]
}
