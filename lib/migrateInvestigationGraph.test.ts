import { describe, it, expect } from 'vitest'
import { migrateInvestigationGraph } from './migrateInvestigationGraph'
import type { Project } from '@/types/project'

describe('migrateInvestigationGraph', () => {
  it('strips empty legacy graph', () => {
    const p = { id: 'p1', analyticalCanvas: { nodes: [], edges: [] } } as Project & {
      investigationGraph?: { nodes: []; edges: [] }
    }
    p.investigationGraph = { nodes: [], edges: [] }
    const out = migrateInvestigationGraph(p)
    expect('investigationGraph' in out).toBe(false)
  })

  it('moves legacy nodes to canvas entities', () => {
    const p = {
      id: 'p1',
      analyticalCanvas: { nodes: [], edges: [] },
      investigationGraph: {
        nodes: [{
          id: 'ip:1.2.3.4',
          type: 'ip',
          label: '1.2.3.4',
          value: '1.2.3.4',
        }],
        edges: [],
      },
    } as unknown as Parameters<typeof migrateInvestigationGraph>[0]
    const out = migrateInvestigationGraph(p)
    expect(out.analyticalCanvas?.nodes).toHaveLength(1)
    expect(out.analyticalCanvas?.nodes[0].type).toBe('entity')
    expect('investigationGraph' in out).toBe(false)
  })
})
