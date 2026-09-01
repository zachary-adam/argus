import { describe, it, expect } from 'vitest'
import { buildShareSnapshotState } from './shareSnapshot'
import type { Project } from '@/types/project'

const project = {
  id: 'p1',
  name: 'Bihar Watch',
  researchQuestion: 'Will violence rise before polls?',
  regionName: 'India',
  regionCenter: [85, 25],
  regionZoom: 5,
  countryCodes: ['IN'],
  createdAt: '',
  updatedAt: '',
  lastOpenedAt: '',
  events: [],
  plots: [],
  predictionLedger: [],
  forecasts: [{ id: 'f1', statement: 'x', probability: 0.5, createdAt: '', dueDate: '2026-08-01' }],
  connectors: [],
  formulaWeightOverrides: {},
  incidents: [],
  watchRules: [],
  aiMode: 'none',
  cases: [{ id: 'c1', name: 'Border case', eventIds: ['e1', 'e2'], notes: '', status: 'active', tags: [], createdAt: '', updatedAt: '' }],
  analyticalCanvas: {
    nodes: [
      { id: 'n1', type: 'event', eventId: 'e1', x: 0, y: 0 },
      { id: 'n2', type: 'ach', x: 0, y: 0, hypotheses: [{ id: 'h1', text: 'Escalation likely' }], scores: [], confidence: 'medium' },
    ],
    edges: [],
  },
} as Project

describe('buildShareSnapshotState', () => {
  it('includes research question, cases, and canvas summary', () => {
    const state = buildShareSnapshotState({
      project,
      viewport: { latitude: 25, longitude: 85, zoom: 5 },
      events: [{ id: 'e1', title: 'Clash', severity: 'high', lat: 1, lon: 2, country: 'IN', source: 'gdelt', timestamp: '', summary: '', category: 'conflict', countryCode: 'IN', url: '' }],
      alerts: [],
      plots: [],
    })
    expect(state.researchQuestion).toContain('violence')
    expect(state.cases).toHaveLength(1)
    expect(state.canvas?.nodeCount).toBe(2)
    expect(state.forecastsOpen).toBe(1)
  })
})
