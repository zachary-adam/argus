import { describe, it, expect } from 'vitest'
import { persistIntelCoordUpdates } from './eventPersist'
import type { Project } from '@/types/project'
import type { IntelEvent } from '@/types'

const project = (events: Project['events']): Project => ({
  id: 'p1',
  name: 'Test',
  regionName: 'Ladakh',
  events,
  regionCenter: [77.56, 34.23],
  regionZoom: 6,
  countryCodes: ['IN'],
  plots: [],
  predictionLedger: [],
  connectors: [],
  createdAt: '',
  updatedAt: '',
} as unknown as Project)

describe('persistIntelCoordUpdates', () => {
  it('writes lat/lon when coords moved', () => {
    const updates: Array<{ id: string; lat: number; lon: number }> = []
    const p = project([{
      id: 'e1', title: 'Galwan clash', summary: '', category: 'conflict',
      lat: 34.23, lon: 77.56, country: 'India', countryCode: 'IN',
      severity: 7, timestamp: '', actors: [], sources: [], sourceCount: 1,
      corroborationCount: 1, confidence: 0.7, dataQualityScore: 0.7,
      reportedAt: '', analystComments: [], rawSource: 'gdelt', projectId: 'p1',
      tags: ['aimed-pull', 'google-news'], locationPrecision: 'exact', flagged: false,
    }])
    const refined: IntelEvent[] = [{
      id: 'e1', title: 'Galwan clash', summary: '', category: 'conflict',
      severity: 'high', lat: 34.76, lon: 78.14, country: 'India', countryCode: 'IN',
      source: 'analyst', timestamp: '', url: '', tags: ['aimed-pull', 'google-news'],
    }]
    const n = persistIntelCoordUpdates(p, refined, (_pid, id, u) => {
      updates.push({ id, lat: u.lat!, lon: u.lon! })
    })
    expect(n).toBe(1)
    expect(updates[0]).toEqual({ id: 'e1', lat: 34.76, lon: 78.14 })
  })

  it('skips when coords unchanged', () => {
    let called = false
    const p = project([{
      id: 'e1', title: 'x', summary: '', category: 'political',
      lat: 34.76, lon: 78.14, country: 'India', countryCode: 'IN',
      severity: 5, timestamp: '', actors: [], sources: [], sourceCount: 1,
      corroborationCount: 1, confidence: 0.7, dataQualityScore: 0.7,
      reportedAt: '', analystComments: [], rawSource: 'gdelt', projectId: 'p1',
      locationPrecision: 'exact', flagged: false, tags: [],
    }])
    persistIntelCoordUpdates(p, [{
      id: 'e1', title: 'x', summary: '', category: 'political', severity: 'medium',
      lat: 34.76, lon: 78.14, country: 'India', countryCode: 'IN', source: 'gdelt', timestamp: '', url: '',
    }], () => { called = true })
    expect(called).toBe(false)
  })
})
