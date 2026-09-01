import { describe, it, expect, vi } from 'vitest'
import {
  canvasEventIds, isEventOnCanvas, createCanvasEventNode,
  eventCaseLabels, addCaseEventsToCanvas, addIntelEventToCanvas,
} from './canvasEvents'
import type { Project, SituationCase } from '@/types/project'

const baseProject = (nodes: NonNullable<Project['analyticalCanvas']>['nodes'] = [], cases: SituationCase[] = []): Project => ({
  id: 'p1',
  name: 'Test',
  createdAt: '',
  updatedAt: '',
  events: [],
  cases,
  analyticalCanvas: { nodes, edges: [] },
} as unknown as Project)

const sampleCase = (overrides?: Partial<SituationCase>): SituationCase => ({
  id: 'case1',
  name: 'Border tensions',
  eventIds: ['ev1', 'ev2', 'ev3'],
  notes: '',
  status: 'active',
  tags: [],
  createdAt: '',
  updatedAt: '',
  ...overrides,
})

describe('canvasEventIds', () => {
  it('returns empty set when no canvas', () => {
    expect(canvasEventIds(null).size).toBe(0)
    expect(canvasEventIds(baseProject()).size).toBe(0)
  })

  it('collects event node ids', () => {
    const project = baseProject([
      createCanvasEventNode('ev1'),
      { id: 'n2', type: 'note', x: 0, y: 0, content: 'hi' },
      createCanvasEventNode('ev2'),
    ])
    expect([...canvasEventIds(project)].sort()).toEqual(['ev1', 'ev2'])
  })
})

describe('isEventOnCanvas', () => {
  it('detects membership', () => {
    const project = baseProject([createCanvasEventNode('ev1')])
    expect(isEventOnCanvas(project, 'ev1')).toBe(true)
    expect(isEventOnCanvas(project, 'ev2')).toBe(false)
  })
})

describe('eventCaseLabels', () => {
  it('maps events to case names', () => {
    const project = baseProject([], [
      sampleCase({ eventIds: ['ev1', 'ev2'] }),
      sampleCase({ id: 'case2', name: 'Election watch', eventIds: ['ev1'] }),
    ])
    expect(eventCaseLabels(project).get('ev1')).toEqual(['Border tensions', 'Election watch'])
    expect(eventCaseLabels(project).get('ev2')).toEqual(['Border tensions'])
  })
})

import type { IntelEvent } from '@/types'

const liveEvent = (id: string): IntelEvent => ({
  id,
  title: `Event ${id}`,
  summary: '',
  category: 'political',
  severity: 'medium',
  lat: 0,
  lon: 0,
  country: '',
  countryCode: '',
  source: 'gdelt',
  url: '',
  timestamp: '2026-06-01T12:00:00Z',
})

describe('addIntelEventToCanvas', () => {
  it('persists live event when addEvents provided', () => {
    const project = baseProject()
    const addCanvasNode = vi.fn()
    const addEvents = vi.fn()
    addIntelEventToCanvas(project, liveEvent('ev9'), addCanvasNode, { addEvents })
    expect(addEvents).toHaveBeenCalledWith('p1', [expect.objectContaining({ id: 'ev9' })])
    expect(addCanvasNode).toHaveBeenCalled()
  })
})

describe('addCaseEventsToCanvas', () => {
  it('adds note + missing events in a grid', () => {
    const project = baseProject([createCanvasEventNode('ev1')], [sampleCase()])
    const addCanvasNode = vi.fn()
    const result = addCaseEventsToCanvas(project, sampleCase(), addCanvasNode)
    expect(result).toEqual({ status: 'added', added: 2, skipped: 1, total: 3 })
    expect(addCanvasNode).toHaveBeenCalledTimes(3) // note + 2 events
    expect(addCanvasNode.mock.calls[0][1].type).toBe('note')
  })

  it('returns already when all events on canvas', () => {
    const project = baseProject([
      createCanvasEventNode('ev1'),
      createCanvasEventNode('ev2'),
      createCanvasEventNode('ev3'),
    ], [sampleCase()])
    const addCanvasNode = vi.fn()
    const result = addCaseEventsToCanvas(project, sampleCase(), addCanvasNode)
    expect(result.status).toBe('already')
    expect(addCanvasNode).not.toHaveBeenCalled()
  })
})
