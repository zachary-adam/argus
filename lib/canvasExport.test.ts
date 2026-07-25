import { describe, it, expect } from 'vitest'
import { formatCanvasMarkdown } from './canvasExport'
import type { Project } from '@/types/project'

const project = {
  id: 'p1',
  name: 'Test',
  regionName: 'Sahel',
  events: [],
  analyticalCanvas: {
    nodes: [
      { id: 'n1', type: 'event', eventId: 'ev1', x: 0, y: 0 },
      { id: 'a1', type: 'ach', x: 0, y: 0, hypotheses: [{ id: 'h1', text: 'Escalation continues' }], scores: [], confidence: 'moderate' },
    ],
    edges: [{ id: 'e1', source: 'n1', target: 'a1', kind: 'supports' }],
  },
} as unknown as Project

describe('formatCanvasMarkdown', () => {
  it('includes canvas inventory and relationships', () => {
    const md = formatCanvasMarkdown(project, [{
      id: 'ev1', title: 'Border clash', severity: 'high', country: 'Mali', timestamp: '2026-01-01T00:00:00Z',
    } as never])
    const text = md.join('\n')
    expect(text).toContain('## Analyst Canvas')
    expect(text).toContain('Border clash')
    expect(text).toContain('supports')
    expect(text).toContain('Escalation continues')
  })
})
