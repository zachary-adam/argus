import { create } from 'zustand'
import { Plot } from '@/types'

interface PlotsState {
  plots: Plot[]
  setPlots: (plots: Plot[]) => void
  addPlot: (plot: Plot) => void
  updatePlot: (id: string, changes: Partial<Plot>) => void
  removePlot: (id: string) => void
  selectedPlotId: string | null
  setSelectedPlotId: (id: string | null) => void
}

export const usePlotsStore = create<PlotsState>((set) => ({
  plots: [],
  setPlots: (plots) => set({ plots }),
  addPlot: (plot) => set(s => ({ plots: [plot, ...s.plots] })),
  updatePlot: (id, changes) => set(s => ({
    plots: s.plots.map(p => p.id === id ? { ...p, ...changes } : p),
  })),
  removePlot: (id) => set(s => ({ plots: s.plots.filter(p => p.id !== id) })),
  selectedPlotId: null,
  setSelectedPlotId: (id) => set({ selectedPlotId: id }),
}))
