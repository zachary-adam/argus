import type { Plot } from '@/types'

export function plotProjectId(plot: Plot): string | undefined {
  return plot.properties?.projectId
}

/** Workspace-wide plots (no projectId) appear on every project. */
export function plotsForProject(plots: Plot[], projectId: string | null | undefined): Plot[] {
  if (!projectId) return plots
  return plots.filter(p => {
    const pid = plotProjectId(p)
    return !pid || pid === projectId
  })
}

export function withPlotProjectId(
  properties: Plot['properties'],
  projectId: string,
): Plot['properties'] {
  return { ...properties, projectId }
}
