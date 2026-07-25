import { describe, it, expect } from 'vitest'
import { buildProjectBackup, mergeProjectImports, parseProjectBackup } from './projectBackup'
import type { Project } from '@/types/project'

const mkProject = (id: string): Project => ({
  id,
  name: `Project ${id}`,
  regionName: 'Test',
  regionCenter: [0, 0],
  regionZoom: 4,
  countryCodes: [],
  events: [],
  plots: [],
  predictionLedger: [],
  connectors: [],
  formulaWeightOverrides: {},
  incidents: [],
  watchRules: [],
  aiMode: 'none',
  createdAt: '2026-01-01T00:00:00Z',
  updatedAt: '2026-01-01T00:00:00Z',
  lastOpenedAt: '2026-01-01T00:00:00Z',
})

describe('projectBackup', () => {
  it('round-trips through JSON export format', () => {
    const backup = buildProjectBackup([mkProject('a')])
    const parsed = parseProjectBackup(JSON.stringify(backup))
    expect(parsed).toHaveLength(1)
    expect(parsed[0].id).toBe('a')
  })

  it('merges imports without overwriting existing ids', () => {
    const merged = mergeProjectImports([mkProject('a')], [mkProject('b'), mkProject('a')])
    expect(merged.map(p => p.id).sort()).toEqual(['a', 'b'])
  })
})
