import { describe, it, expect } from 'vitest'
import { computeTidyCanvasPositions, computeTimelinePositions } from './canvasLayout'
import type { CanvasNode } from '@/types/project'

describe('computeTidyCanvasPositions', () => {
  it('returns empty for no nodes', () => {
    expect(computeTidyCanvasPositions([])).toEqual({})
  })

  it('places ACH above events', () => {
    const nodes: CanvasNode[] = [
      { id: 'e1', type: 'event', eventId: 'ev1', x: 500, y: 500 },
      { id: 'a1', type: 'ach', hypotheses: [], scores: [], confidence: 'moderate', x: 0, y: 0 },
    ]
    const pos = computeTidyCanvasPositions(nodes)
    expect(pos.a1.y).toBeLessThan(pos.e1.y)
  })

  it('lays events in a grid without overlap', () => {
    const nodes: CanvasNode[] = Array.from({ length: 5 }, (_, i) => ({
      id: `e${i}`,
      type: 'event' as const,
      eventId: `ev${i}`,
      x: 0,
      y: 0,
    }))
    const pos = computeTidyCanvasPositions(nodes)
    const ys = new Set(Object.values(pos).map(p => `${p.x},${p.y}`))
    expect(ys.size).toBe(5)
  })
})

describe('computeTimelinePositions', () => {
  const ev = (id: string): CanvasNode => ({ id, type: 'event', eventId: id, x: 0, y: 0 })

  it('orders events left-to-right by timestamp', () => {
    const nodes = [ev('a'), ev('b'), ev('c')]
    const meta = new Map([
      ['a', { timestamp: '2026-03-03T00:00:00Z', country: 'Ukraine' }],
      ['b', { timestamp: '2026-03-01T00:00:00Z', country: 'Ukraine' }],
      ['c', { timestamp: '2026-03-05T00:00:00Z', country: 'Ukraine' }],
    ])
    const pos = computeTimelinePositions(nodes, meta)
    expect(pos.b.x).toBeLessThan(pos.a.x)   // earliest leftmost
    expect(pos.a.x).toBeLessThan(pos.c.x)
  })

  it('separates countries into distinct lanes (Y)', () => {
    const nodes = [ev('a'), ev('b')]
    const meta = new Map([
      ['a', { timestamp: '2026-03-01T00:00:00Z', country: 'Ukraine' }],
      ['b', { timestamp: '2026-03-01T00:00:00Z', country: 'Russia' }],
    ])
    const pos = computeTimelinePositions(nodes, meta)
    expect(pos.a.y).not.toBe(pos.b.y)
  })

  it('falls back to tidy layout when no events have timestamps', () => {
    const nodes = [ev('a')]
    const pos = computeTimelinePositions(nodes, new Map())
    expect(pos.a).toBeDefined()
  })
})
