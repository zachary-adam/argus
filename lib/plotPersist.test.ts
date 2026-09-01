import { describe, it, expect, beforeEach } from 'vitest'
import { mirrorPlotToProject, mergePlotsFromApi } from './plotPersist'
import { useProjectStore } from '@/stores/projectStore'
import { usePlotsStore } from '@/stores/plotsStore'
import type { Plot } from '@/types'
import type { Project } from '@/types/project'

const baseProject = (): Project => ({
  id: 'p1',
  name: 'Test',
  regionName: 'Test',
  regionCenter: [0, 0],
  regionZoom: 3,
  countryCodes: [],
  createdAt: '',
  updatedAt: '',
  lastOpenedAt: '',
  events: [],
  plots: [],
  connectors: [],
  targeting: { scope: 'global', keywords: [], watchEntities: [] },
  cases: [],
  incidents: [],
  predictionLedger: [],
  analyticalCanvas: { nodes: [], edges: [] },
  journal: [],
  hypothesisLog: [],
  eventPaperLinks: [],
  deletedEventIds: [],
  formulaWeightOverrides: {},
  aiMode: 'none',
  watchRules: [],
})

const plot = (id: string): Plot => ({
  id,
  workspace_id: 'w1',
  type: 'point',
  coordinates: [1, 2],
  label: 'A',
  properties: { projectId: 'p1' },
  created_at: '2026-01-01',
})

describe('mirrorPlotToProject', () => {
  beforeEach(() => {
    useProjectStore.setState({ projects: [baseProject()], activeProjectId: 'p1' })
    usePlotsStore.setState({ plots: [], selectedPlotId: null })
  })

  it('adds plot to project when missing', () => {
    mirrorPlotToProject(plot('pl1'))
    expect(useProjectStore.getState().projects[0].plots?.map(p => p.id)).toEqual(['pl1'])
  })

  it('updates plot when id already exists', () => {
    useProjectStore.setState({
      projects: [{ ...baseProject(), plots: [plot('pl1')] }],
    })
    mirrorPlotToProject({ ...plot('pl1'), label: 'Updated' })
    expect(useProjectStore.getState().projects[0].plots?.[0].label).toBe('Updated')
  })
})

describe('mergePlotsFromApi', () => {
  beforeEach(() => {
    useProjectStore.setState({ projects: [baseProject()], activeProjectId: 'p1' })
    usePlotsStore.setState({ plots: [plot('local_1')], selectedPlotId: null })
  })

  it('keeps local-only plots and merges API plots', () => {
    const merged = mergePlotsFromApi([plot('api_1')], usePlotsStore.getState().plots)
    expect(merged.map(p => p.id).sort()).toEqual(['api_1', 'local_1'])
    expect(useProjectStore.getState().projects[0].plots?.some(p => p.id === 'api_1')).toBe(true)
  })
})
