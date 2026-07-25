import { describe, expect, it } from 'vitest'
import type { JournalEntry, Project } from '@/types/project'
import { isJournalEntryOnCanvas } from '@/lib/canvasEvents'
import { addJournalEntryToCanvas } from '@/lib/journalCanvas'

function baseProject(nodes: Project['analyticalCanvas']): Project {
  return {
    id: 'p1',
    name: 'Test',
    regionName: 'R',
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
    createdAt: '2026-01-01',
    updatedAt: '2026-01-01',
    lastOpenedAt: '2026-01-01',
    analyticalCanvas: nodes,
  }
}

describe('journal canvas linkage', () => {
  const paperEntry: JournalEntry = {
    id: 'jr_paper',
    kind: 'paper',
    title: 'Test Paper',
    doi: '10.1234/test',
    savedAt: '2026-01-01',
    updatedAt: '2026-01-01',
  }

  it('detects paper on canvas by journalEntryId', () => {
    const p = baseProject({
      nodes: [{ id: 'n1', type: 'source', x: 0, y: 0, title: 'Test Paper', authors: [], journalEntryId: 'jr_paper' }],
      edges: [],
    })
    expect(isJournalEntryOnCanvas(p, paperEntry)).toBe(true)
  })

  it('returns already when re-adding the same journal entry', () => {
    const p = baseProject({ nodes: [], edges: [] })
    const added: unknown[] = []
    const addNode = (_id: string, node: unknown) => { added.push(node) }
    expect(addJournalEntryToCanvas(p, paperEntry, addNode)).toBe('added')
    const p2 = baseProject({
      nodes: [{ id: 'n1', type: 'source', x: 0, y: 0, title: 'Test Paper', authors: [], journalEntryId: 'jr_paper' }],
      edges: [],
    })
    expect(addJournalEntryToCanvas(p2, paperEntry, addNode)).toBe('already')
  })
})
