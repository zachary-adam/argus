import { describe, it, expect } from 'vitest'
import { migrateForecastsToProjects } from './migrateForecasts'
import type { Project } from '@/types/project'
import type { Forecast } from '@/lib/forecasting'

const baseProject = (id: string): Project => ({
  id,
  name: 'Test',
  regionName: 'Test',
  regionCenter: [0, 0],
  regionZoom: 4,
  countryCodes: [],
  createdAt: '',
  updatedAt: '',
  lastOpenedAt: '',
  events: [],
  plots: [],
  predictionLedger: [],
  forecasts: [],
  connectors: [],
  formulaWeightOverrides: {},
  incidents: [],
  watchRules: [],
  aiMode: 'none',
} as Project)

describe('migrateForecastsToProjects', () => {
  it('merges legacy forecasts by projectId', () => {
    const legacy: Forecast[] = [{
      id: 'f1',
      statement: 'Violence rises',
      probability: 0.6,
      createdAt: '2026-01-01',
      dueDate: '2026-02-01',
      projectId: 'p1',
    }]
    const merged = migrateForecastsToProjects([baseProject('p1'), baseProject('p2')], legacy)
    expect(merged[0].forecasts).toHaveLength(1)
    expect(merged[0].forecasts![0].statement).toBe('Violence rises')
    expect(merged[0].forecasts![0].projectId).toBeUndefined()
    expect(merged[1].forecasts).toHaveLength(0)
  })

  it('skips duplicates by id', () => {
    const existing: Forecast = {
      id: 'f1', statement: 'Old', probability: 0.5, createdAt: '', dueDate: '2026-01-01',
    }
    const legacy: Forecast[] = [{
      id: 'f1', statement: 'New', probability: 0.8, createdAt: '', dueDate: '2026-02-01', projectId: 'p1',
    }]
    const merged = migrateForecastsToProjects([{ ...baseProject('p1'), forecasts: [existing] }], legacy)
    expect(merged[0].forecasts).toHaveLength(1)
    expect(merged[0].forecasts![0].statement).toBe('Old')
  })
})
